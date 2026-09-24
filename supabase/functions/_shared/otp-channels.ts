// OTP delivery channels, behind one interface.
//
// No production provider is committed (decision, 2026-09-23): delivery to Zain / MTN / Sudani has to be
// proven on real handsets before anyone signs a contract. So the sender is chosen by environment, and
// swapping it never touches the auth architecture — Supabase always calls the same hook.
//
// Channel strategy: WhatsApp first where enabled (roughly 1/20th the price of SMS to Sudan), SMS as
// fallback. Sudan has frequent nationwide internet shutdowns and SMS survives a data-only outage, which
// is why both exist rather than just the cheap one.

import { sendWhatsappTemplate, whatsappConfigured } from "./whatsapp.ts";

export type OtpChannel = "whatsapp" | "sms";

export type SendResult = {
  ok: boolean;
  provider: string;
  messageId: string | null;
  error: string | null;
};

const env = (key: string) => Deno.env.get(key)?.trim() || undefined;

// ---------------------------------------------------------------------------- WhatsApp (Meta Cloud API)
// Authentication-category template: fixed text, one body variable (the code), and a one-tap copy button
// whose parameter is the same code. Approved separately from the order-notification template, which is
// why the name and language are configuration.

async function sendWhatsapp(phone: string, code: string): Promise<SendResult> {
  const result = await sendWhatsappTemplate({
    phone,
    template: env("WHATSAPP_OTP_TEMPLATE") ?? "tips_beauty_otp",
    language: env("WHATSAPP_OTP_LANGUAGE") ?? "ar",
    bodyParams: [{ type: "text", text: code }],
    buttonParams: [{ type: "text", text: code }],
  });
  return {
    ok: result.ok,
    provider: "whatsapp_cloud",
    messageId: result.messageId,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------- SMS
// Two implementations. Twilio is the reference one (it publishes Sudan coverage); the generic HTTP form
// exists so a Sudanese aggregator with a plain REST endpoint can be dropped in without new code — which
// is the likely outcome once delivery is measured, because Twilio's list price to Sudan is ~$0.47.

export function smsConfigured(): boolean {
  return smsProvider() !== null;
}

function smsProvider(): "twilio" | "generic" | null {
  const explicit = env("SMS_PROVIDER");
  if (explicit === "twilio" || explicit === "generic") return explicit;
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN")) return "twilio";
  if (env("SMS_HTTP_URL")) return "generic";
  return null;
}

function smsBody(code: string): string {
  // Arabic, and deliberately short: Sudanese networks drop long alphanumeric messages more often, and
  // every extra segment is charged again.
  return `رمز الدخول إلى تيبس بيوتي: ${code}`;
}

async function sendTwilio(phone: string, code: string): Promise<SendResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  // Numeric sender IDs are dropped by MTN Sudan and Sudani, so this is normally an approved
  // alphanumeric ID rather than a phone number.
  const from = env("TWILIO_SENDER_ID") ?? env("TWILIO_FROM");
  if (!sid || !token || !from) {
    return { ok: false, provider: "twilio", messageId: null, error: "Twilio is not configured" };
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: from, Body: smsBody(code) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, provider: "twilio", messageId: null, error: payload?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, provider: "twilio", messageId: payload?.sid ?? null, error: null };
  } catch (error) {
    return { ok: false, provider: "twilio", messageId: null, error: error instanceof Error ? error.message : "Twilio send failed" };
  }
}

async function sendGenericSms(phone: string, code: string): Promise<SendResult> {
  const url = env("SMS_HTTP_URL");
  if (!url) return { ok: false, provider: "generic", messageId: null, error: "SMS_HTTP_URL is not set" };

  // The body template is configuration so an aggregator's field names need no code change.
  // {{phone}}, {{message}} and {{sender}} are substituted; default shape suits most REST gateways.
  const template = env("SMS_HTTP_BODY") ?? '{"to":"{{phone}}","from":"{{sender}}","text":"{{message}}"}';
  const sender = env("SMS_SENDER_ID") ?? "TIPSBEAUTY";
  const body = template
    .replaceAll("{{phone}}", phone)
    .replaceAll("{{sender}}", sender)
    // JSON.stringify then trim the quotes: the code is digits, but the Arabic prefix must be escaped.
    .replaceAll("{{message}}", JSON.stringify(smsBody(code)).slice(1, -1));

  const headers: Record<string, string> = { "Content-Type": env("SMS_HTTP_CONTENT_TYPE") ?? "application/json" };
  const authHeader = env("SMS_HTTP_AUTH_HEADER");
  if (authHeader) headers.Authorization = authHeader;

  try {
    const response = await fetch(url, { method: env("SMS_HTTP_METHOD") ?? "POST", headers, body });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, provider: "generic", messageId: null, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    // Gateways vary wildly in what they return; the raw id is not worth guessing at.
    return { ok: true, provider: "generic", messageId: null, error: null };
  } catch (error) {
    return { ok: false, provider: "generic", messageId: null, error: error instanceof Error ? error.message : "SMS send failed" };
  }
}

async function sendSms(phone: string, code: string): Promise<SendResult> {
  switch (smsProvider()) {
    case "twilio": return await sendTwilio(phone, code);
    case "generic": return await sendGenericSms(phone, code);
    default: return { ok: false, provider: "none", messageId: null, error: "No SMS provider configured" };
  }
}

/** Sends over one channel. Channel selection and fallback are the caller's job. */
export async function sendOtp(channel: OtpChannel, phone: string, code: string): Promise<SendResult> {
  return channel === "whatsapp" ? await sendWhatsapp(phone, code) : await sendSms(phone, code);
}

export function channelConfigured(channel: OtpChannel): boolean {
  return channel === "whatsapp" ? whatsappConfigured() : smsConfigured();
}
