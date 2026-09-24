import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsappTemplate, whatsappConfigured } from "../_shared/whatsapp.ts";

// Drains notification_queue rows with channel = 'whatsapp'. Invoked by pg_cron (dispatch_whatsapp_queue)
// with an x-cron-key header, exactly like send-order-emails; deployed with --no-verify-jwt and never
// called from a browser.
//
// These exist for customers who signed in with a phone and have no email address: without this they hear
// nothing about an order they just placed.
//
// Scope is one message — the order confirmation — matching what email customers get. The template is a
// *utility* template approved separately from the OTP one.

type QueueRow = {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  event_type: string;
  recipient_phone: string | null;
  payload: { order_number?: string } | null;
  attempts: number;
};

const BATCH = 20;
const MAX_ATTEMPTS = 5;
const TEMPLATE = Deno.env.get("WHATSAPP_ORDER_TEMPLATE") ?? "tips_beauty_order_created";
const LANGUAGE = Deno.env.get("WHATSAPP_ORDER_LANGUAGE") ?? "ar";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-key") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: queue, error: queueError } = await service.from("notification_queue")
    .select("id,order_id,customer_id,event_type,recipient_phone,payload,attempts")
    .eq("channel", "whatsapp").eq("status", "pending").lt("attempts", MAX_ATTEMPTS)
    .order("created_at").limit(BATCH);
  if (queueError) return new Response(JSON.stringify({ error: queueError.message }), { status: 500 });
  if (!queue?.length) return new Response(JSON.stringify({ processed: 0 }), { status: 200 });

  let sent = 0, failed = 0, skipped = 0;

  for (const row of queue as QueueRow[]) {
    const mark = (status: "sent" | "failed" | "cancelled" | "pending", extra: Record<string, unknown> = {}) =>
      service.from("notification_queue").update({ status, attempts: row.attempts + 1, ...extra }).eq("id", row.id);

    try {
      if (!row.recipient_phone) {
        // Nothing to retry: the row was queued without a number.
        await mark("cancelled", { error_message: "No recipient phone" });
        skipped++;
        continue;
      }
      if (!whatsappConfigured()) {
        // Same posture as the email pipeline: log it, keep it pending, never block an order.
        await mark("failed", { error_message: "WhatsApp is not configured" });
        failed++;
        continue;
      }

      let orderNumber = row.payload?.order_number ?? "";
      if (!orderNumber && row.order_id) {
        const { data: order } = await service.from("orders").select("order_number").eq("id", row.order_id).maybeSingle();
        orderNumber = order?.order_number ?? "";
      }

      const result = await sendWhatsappTemplate({
        phone: row.recipient_phone,
        template: TEMPLATE,
        language: LANGUAGE,
        // The utility template's single variable is the order number.
        bodyParams: [{ type: "text", text: orderNumber || "-" }],
      });

      if (result.ok) {
        await mark("sent", {
          provider_reference: result.messageId,
          sent_at: new Date().toISOString(),
          error_message: null,
        });
        sent++;
        continue;
      }

      if (result.recipientInvalid) {
        // The number has no WhatsApp account. Retrying cannot fix that, and each attempt is billable.
        await mark("cancelled", { error_message: result.error });
        skipped++;
        continue;
      }

      const nextStatus = row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
      await mark(nextStatus, { error_message: result.error });
      failed++;
    } catch (error) {
      console.error("send-order-whatsapp", row.id, error);
      const nextStatus = row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
      await service.from("notification_queue")
        .update({
          status: nextStatus,
          attempts: row.attempts + 1,
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed: queue.length, sent, failed, skipped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
