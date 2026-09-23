import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { channelConfigured, sendOtp, type OtpChannel } from "../_shared/otp-channels.ts";

// Supabase Auth "Send SMS" hook.
//
// Supabase generates and verifies the code; this function only delivers it. That is the whole point of
// the seam: the provider and the channel are ours to change, while sign-in stays plain
// supabase.auth.signInWithOtp() in the app.
//
// Contract (https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook):
//   POST { user: { id, phone, ... }, sms: { otp: "123456" } }
//   200 with an empty body = delivered. Any non-2xx = Supabase reports the failure to the caller.
//
// Configure in Supabase: Authentication > Hooks > Send SMS, pointing at this function, with the shared
// secret in SEND_SMS_HOOK_SECRET. Phone sign-in must also be enabled under Authentication > Providers.

type HookPayload = {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string };
};

type OtpSettings = {
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  primary_channel: OtpChannel;
  cooldown_seconds: number;
  max_per_phone_hour: number;
  max_per_ip_hour: number;
};

type RateDecision = { allowed: boolean; reason: string; retry_after: number; attempt: number };

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * Supabase signs hook requests. Verifying the shared secret matters more here than on most functions:
 * an unauthenticated caller could otherwise burn the SMS budget by asking for codes.
 */
function authorised(request: Request): boolean {
  const secret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim();
  // Fail closed. An unset secret means the hook is misconfigured, not that everyone is welcome.
  if (!secret) return false;

  const header = request.headers.get("webhook-signature") ?? request.headers.get("authorization") ?? "";
  // Supabase sends the secret as `v1,whsec_...`; accept either the bare secret or that envelope.
  const bare = secret.replace(/^v1,\s*/, "").replace(/^whsec_/, "");
  return header.includes(bare);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }
  if (!authorised(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let phone = "";
  let attempt: number | null = null;

  try {
    const payload = await request.json() as HookPayload;
    phone = payload.user?.phone?.trim() ?? "";
    const code = payload.sms?.otp?.trim() ?? "";
    if (!phone || !code) {
      return new Response(JSON.stringify({ error: "Missing phone or code" }), { status: 400, headers: jsonHeaders });
    }
    // Supabase stores the phone without a +; every channel and the database expect E.164.
    if (!phone.startsWith("+")) phone = `+${phone}`;

    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || null;

    // Rate limit first: the point is to not spend money on abuse.
    const { data: decisionData, error: decisionError } = await service.rpc("record_otp_attempt", {
      p_phone: phone,
      p_ip: ip,
    });
    if (decisionError) throw decisionError;
    const decision = decisionData as unknown as RateDecision;
    attempt = decision.attempt ?? null;

    if (!decision.allowed) {
      await service.rpc("log_otp_delivery", {
        p_phone: phone,
        p_channel: "sms",
        p_provider: null,
        p_status: "blocked",
        p_error: decision.reason,
        p_attempt: attempt,
      });
      // 429 so Supabase surfaces a retryable failure rather than a server error.
      return new Response(JSON.stringify({ error: decision.reason, retry_after: decision.retry_after }), {
        status: 429,
        headers: { ...jsonHeaders, "Retry-After": String(decision.retry_after) },
      });
    }

    const { data: settingsData, error: settingsError } = await service.rpc("get_otp_settings");
    if (settingsError) throw settingsError;
    const settings = settingsData as unknown as OtpSettings;

    // Primary first, then the other one. A channel that is switched off or unconfigured is skipped
    // rather than attempted and failed, so the log shows real delivery problems only.
    const order: OtpChannel[] = settings.primary_channel === "sms" ? ["sms", "whatsapp"] : ["whatsapp", "sms"];
    const usable = order.filter((channel) =>
      (channel === "whatsapp" ? settings.whatsapp_enabled : settings.sms_enabled) && channelConfigured(channel));

    if (!usable.length) {
      await service.rpc("log_otp_delivery", {
        p_phone: phone,
        p_channel: settings.primary_channel,
        p_provider: null,
        p_status: "failed",
        p_error: "No OTP channel is enabled and configured",
        p_attempt: attempt,
      });
      return new Response(JSON.stringify({ error: "No OTP channel available" }), { status: 503, headers: jsonHeaders });
    }

    const failures: string[] = [];
    for (const channel of usable) {
      const result = await sendOtp(channel, phone, code);
      await service.rpc("log_otp_delivery", {
        p_phone: phone,
        p_channel: channel,
        p_provider: result.provider,
        p_status: result.ok ? "sent" : "failed",
        p_provider_message_id: result.messageId,
        p_error: result.error,
        p_attempt: attempt,
      });
      // An empty 200 is what the hook contract calls success.
      if (result.ok) return new Response(null, { status: 200 });
      failures.push(`${channel}: ${result.error}`);
    }

    console.error("send-otp all channels failed", failures.join(" | "));
    return new Response(JSON.stringify({ error: "OTP delivery failed" }), { status: 502, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("send-otp", message);
    // Best effort: a customer support question needs the row even when the function itself broke.
    if (phone) {
      await service.rpc("log_otp_delivery", {
        p_phone: phone,
        p_channel: "sms",
        p_provider: null,
        p_status: "failed",
        p_error: message,
        p_attempt: attempt,
      }).catch(() => undefined);
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
