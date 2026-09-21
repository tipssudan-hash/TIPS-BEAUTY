import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Drains notification_queue rows with channel = 'email'. Invoked by pg_cron (dispatch_email_queue)
// with an x-cron-key header; deployed with --no-verify-jwt. Never called from browsers.

type QueueRow = {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  event_type: string;
  payload: { audience?: "customer" | "staff"; order_number?: string; recipient?: string };
  attempts: number;
};

type OrderItem = { id: string; quantity: number; name_ar?: string; variant_name?: string | null; variant_price?: number | null; unit_price?: number; discount_percentage?: number; effective_unit_price?: number; pricing_rule_label?: string | null; line_total?: number };

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_id: string | null;
  customer_name: string;
  phone: string;
  items: OrderItem[];
  total: number;
  shipping_fee: number | null;
  coupon_code: string | null;
  discount_amount: number | null;
  points_discount: number | null;
  status: string;
  payment_method: string;
  payment_status: string;
  shipping_address: string;
  city: string | null;
  state: string | null;
  created_at: string;
};

const BATCH = 20;
const MAX_ATTEMPTS = 5;
const FROM = Deno.env.get("EMAIL_FROM") ?? "TIPS Beauty <orders@tips-sd.com>";
const ADMIN_URL = (Deno.env.get("ADMIN_PORTAL_URL") ?? "https://admin.beauty.tips-sd.com").replace(/\/$/, "");
const TIMEZONE = "Africa/Khartoum";

const statusLabels: Record<string, string> = {
  new: "جديد", confirmed: "مؤكد", preparing: "قيد التجهيز", shipped: "في الطريق", delivered: "تم التوصيل", cancelled: "ملغي", delivery_failed: "تعذر التسليم",
};
const paymentLabels: Record<string, string> = { COD: "الدفع عند الاستلام", Mychashi: "تحويل ماي كاشي" };

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (value: number | null | undefined) => `${Number(value ?? 0).toLocaleString("ar-EG")} ج.س`;
const formatDate = (iso: string) => new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: TIMEZONE }).format(new Date(iso));

function orderTable(order: OrderRow, names: Map<string, string>): string {
  const rows = order.items.map((item) => {
    // The chosen Variant (shade/size) is part of the line as the customer ordered it.
    const name = (item.name_ar ?? names.get(item.id) ?? "منتج") + (item.variant_name ? ` — ${item.variant_name}` : "");
    // Lines snapshot the effective unit price (T2-07); older orders carry only the Discount.
    const unit = item.effective_unit_price != null ? Number(item.effective_unit_price) : item.unit_price != null ? item.unit_price * (1 - (item.discount_percentage ?? 0) / 100) : null;
    const line = item.line_total ?? (unit != null ? unit * item.quantity : null);
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escape(name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${line != null ? money(line) : "—"}</td></tr>`;
  }).join("");
  const subtotal = order.items.reduce((sum, item) => sum + (item.line_total ?? 0), 0);
  const coupon = Number(order.discount_amount ?? 0);
  const points = Number(order.points_discount ?? 0);
  return `
    <table dir="rtl" style="border-collapse:collapse;width:100%;font-family:Tahoma,Arial,sans-serif;font-size:14px">
      <thead><tr style="background:#f5f5f5"><th style="padding:6px 8px;text-align:right">المنتج</th><th style="padding:6px 8px">الكمية</th><th style="padding:6px 8px;text-align:right">الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:6px 8px">المجموع الفرعي</td><td style="padding:6px 8px">${money(subtotal)}</td></tr>
        ${coupon > 0 ? `<tr><td colspan="2" style="padding:6px 8px">كود الخصم${order.coupon_code ? ` (${escape(order.coupon_code)})` : ""}</td><td style="padding:6px 8px">- ${money(coupon)}</td></tr>` : ""}
        ${points > 0 ? `<tr><td colspan="2" style="padding:6px 8px">خصم النقاط</td><td style="padding:6px 8px">- ${money(points)}</td></tr>` : ""}
        <tr><td colspan="2" style="padding:6px 8px">رسوم التوصيل</td><td style="padding:6px 8px">${money(order.shipping_fee)}</td></tr>
        <tr style="font-weight:bold"><td colspan="2" style="padding:6px 8px">الإجمالي النهائي</td><td style="padding:6px 8px">${money(order.total)}</td></tr>
      </tfoot>
    </table>`;
}

function detailsList(order: OrderRow, includeName: boolean): string {
  const address = [order.shipping_address, order.city, order.state].filter(Boolean).map(escape).join("، ");
  const lines = [
    includeName ? `<li><b>العميل:</b> ${escape(order.customer_name)}</li>` : "",
    `<li><b>الهاتف:</b> ${escape(order.phone)}</li>`,
    `<li><b>العنوان:</b> ${address}</li>`,
    `<li><b>طريقة الدفع:</b> ${escape(paymentLabels[order.payment_method] ?? order.payment_method)}</li>`,
    `<li><b>حالة الطلب:</b> ${escape(statusLabels[order.status] ?? order.status)}</li>`,
    `<li><b>تاريخ الطلب:</b> ${escape(formatDate(order.created_at))}</li>`,
  ];
  return `<ul dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;padding-right:18px">${lines.join("")}</ul>`;
}

function customerEmail(order: OrderRow, names: Map<string, string>) {
  const number = escape(order.order_number ?? "");
  return {
    subject: `تأكيد استلام طلبك ${number} — تيبس بيوتي`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#b5177a">شكراً لطلبك من تيبس بيوتي</h2>
      <p>تم استلام طلبك رقم <b>${number}</b> بنجاح وسنقوم بتأكيده قريباً.</p>
      ${orderTable(order, names)}
      ${detailsList(order, false)}
      <p style="color:#666;font-size:12px">هذه رسالة تلقائية، يرجى عدم الرد عليها.</p>
    </div>`,
  };
}

function staffEmail(order: OrderRow, names: Map<string, string>) {
  const number = escape(order.order_number ?? "");
  return {
    subject: `طلب جديد ${number} — ${escape(order.customer_name)}`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:600px;margin:auto">
      <h2>طلب جديد رقم ${number}</h2>
      ${detailsList(order, true)}
      ${orderTable(order, names)}
      <p><a href="${ADMIN_URL}/orders/${order.id}" style="display:inline-block;padding:10px 16px;background:#b5177a;color:#fff;text-decoration:none;border-radius:6px">فتح الطلب في لوحة الإدارة</a></p>
    </div>`,
  };
}

async function sendViaResend(apiKey: string, to: string[], subject: string, html: string): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? `Resend HTTP ${response.status}`);
  return data?.id ?? "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-key") !== cronSecret) return new Response("Unauthorized", { status: 401 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: queue, error: queueError } = await service.from("notification_queue")
    .select("id,order_id,customer_id,event_type,payload,attempts")
    .eq("channel", "email").eq("status", "pending").lt("attempts", MAX_ATTEMPTS)
    .order("created_at").limit(BATCH);
  if (queueError) return new Response(JSON.stringify({ error: queueError.message }), { status: 500 });
  if (!queue?.length) return new Response(JSON.stringify({ processed: 0 }), { status: 200 });

  const { data: settings } = await service.from("app_settings").select("notification_emails").eq("id", true).maybeSingle();
  const looksLikeEmail = (e: string) => /\S+@\S+\.\S+/.test(e);
  const staffRecipients: string[] = (settings?.notification_emails ?? []).filter(looksLikeEmail);

  let sent = 0, failed = 0, skipped = 0;
  for (const row of queue as QueueRow[]) {
    const mark = (status: "sent" | "failed" | "cancelled", extra: Record<string, unknown> = {}) =>
      service.from("notification_queue").update({ status, attempts: row.attempts + 1, ...extra }).eq("id", row.id);
    try {
      if (!row.order_id) { await mark("cancelled", { error_message: "No order" }); skipped++; continue; }
      const { data: order, error: orderError } = await service.from("orders")
        .select("id,order_number,customer_id,customer_name,phone,items,total,shipping_fee,coupon_code,discount_amount,points_discount,status,payment_method,payment_status,shipping_address,city,state,created_at")
        .eq("id", row.order_id).maybeSingle();
      if (orderError || !order) { await mark("cancelled", { error_message: "Order not found" }); skipped++; continue; }

      const typed = order as OrderRow;
      typed.items = Array.isArray(typed.items) ? typed.items : [];
      const missing = typed.items.filter((i) => !i.name_ar).map((i) => i.id);
      const names = new Map<string, string>();
      if (missing.length) {
        const { data: products } = await service.from("products").select("id,name_ar").in("id", missing);
        for (const p of products ?? []) names.set(p.id, p.name_ar);
      }

      let to: string[] = [];
      let content: { subject: string; html: string };
      if (row.payload?.audience === "staff") {
        // One row per recipient (T2-03); rows queued before that carry no recipient and fan out to the settings list.
        if (row.payload.recipient && !looksLikeEmail(row.payload.recipient)) { await mark("cancelled", { error_message: "Invalid recipient" }); skipped++; continue; }
        to = row.payload.recipient ? [row.payload.recipient] : staffRecipients;
        content = staffEmail(typed, names);
      } else {
        const { data: profile } = await service.from("profiles").select("email").eq("id", typed.customer_id ?? "").maybeSingle();
        if (profile?.email) to = [profile.email];
        content = customerEmail(typed, names);
      }
      if (!to.length) { await mark("cancelled", { error_message: "No recipient configured" }); skipped++; continue; }
      if (!resendKey) { await mark("failed", { error_message: "RESEND_API_KEY not configured" }); failed++; continue; }

      const reference = await sendViaResend(resendKey, to, content.subject, content.html);
      await mark("sent", { provider_reference: reference, sent_at: new Date().toISOString(), error_message: null });
      sent++;
    } catch (error) {
      console.error("send-order-emails", row.id, error);
      const nextStatus = row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
      await service.from("notification_queue").update({ status: nextStatus, attempts: row.attempts + 1, error_message: error instanceof Error ? error.message : String(error) }).eq("id", row.id);
      failed++;
    }
  }
  return new Response(JSON.stringify({ processed: queue.length, sent, failed, skipped }), { status: 200, headers: { "Content-Type": "application/json" } });
});
