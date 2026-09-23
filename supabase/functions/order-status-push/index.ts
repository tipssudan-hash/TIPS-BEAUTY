import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { fcmConfigured, sendFcmMessage } from "../_shared/fcm.ts";

// Order push notifications, dispatched per device by provider.
//
// This function was written for an Expo wrapper that no longer exists. The Capacitor apps register
// FCM tokens instead (Firebase relays to APNs for iOS), so each device row now names its transport
// and is dispatched accordingly. The Expo path is unchanged and still runs for rows registered by
// older installs — it comes out only once FCM is verified on real handsets.

type DeliveryStatus = "shipped" | "delivered";
type PushEvent = DeliveryStatus | "review_request";
type PushProvider = "expo" | "fcm";
type PushToken = { id: string; provider: PushProvider; push_token: string; expo_push_token: string | null };
type OrderRow = { id: string; order_number: string | null; customer_id: string; driver_id: string | null; status: string };
type Target = { token: PushToken; eventType: PushEvent };
type DispatchOutcome = { status: "submitted" | "failed"; messageId: string | null; error: string | null; tokenInvalid: boolean; payload: unknown };

const copy: Record<PushEvent, { title: string; body: (number: string) => string; url: string }> = {
  shipped: { title: "طلبك في الطريق", body: (number) => `طلبك ${number} أصبح في الطريق إليك.`, url: "/orders" },
  delivered: { title: "تم توصيل طلبك", body: (number) => `تم توصيل طلبك ${number} بنجاح. نتمنى لك تجربة جميلة.`, url: "/orders" },
  review_request: { title: "كيف كانت تجربتك؟", body: (number) => `تم توصيل طلبك ${number}. شاركينا رأيك في المنتجات التي استلمتها.`, url: "/orders" },
};

/** Expo Push Service. Batched, as it always was: one request for every Expo device. */
async function dispatchExpo(targets: Target[], order: OrderRow): Promise<Map<string, DispatchOutcome>> {
  const outcomes = new Map<string, DispatchOutcome>();
  if (!targets.length) return outcomes;

  const key = (target: Target) => `${target.eventType}:${target.token.id}`;

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(targets.map(({ token, eventType }) => {
        const message = copy[eventType];
        return {
          to: token.expo_push_token ?? token.push_token,
          sound: "default",
          title: message.title,
          body: message.body(order.order_number ?? ""),
          channelId: "orders",
          data: { orderId: order.id, url: message.url, eventType },
        };
      })),
    });
    const payload = await response.json().catch(() => ({ errors: [{ message: "Invalid Expo response" }] }));
    if (!response.ok) throw new Error(payload?.errors?.[0]?.message ?? "Expo Push Service request failed");

    const tickets = Array.isArray(payload.data) ? payload.data : [];
    targets.forEach((target, index) => {
      const ticket = tickets[index] ?? {};
      outcomes.set(key(target), {
        status: ticket.status === "ok" ? "submitted" : "failed",
        messageId: ticket.id ?? null,
        error: ticket.message ?? null,
        tokenInvalid: ticket?.details?.error === "DeviceNotRegistered",
        payload: ticket,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expo send failed";
    for (const target of targets) {
      outcomes.set(key(target), { status: "failed", messageId: null, error: message, tokenInvalid: false, payload: {} });
    }
  }
  return outcomes;
}

/** FCM HTTP v1 takes one device per request, so these go out in parallel. */
async function dispatchFcm(targets: Target[], order: OrderRow): Promise<Map<string, DispatchOutcome>> {
  const outcomes = new Map<string, DispatchOutcome>();
  if (!targets.length) return outcomes;

  if (!fcmConfigured()) {
    // Same posture as the email pipeline: log it, never block the order.
    for (const target of targets) {
      outcomes.set(`${target.eventType}:${target.token.id}`, {
        status: "failed", messageId: null, error: "FCM_SERVICE_ACCOUNT_JSON is not set", tokenInvalid: false, payload: {},
      });
    }
    return outcomes;
  }

  const results = await Promise.all(targets.map(async (target) => {
    const message = copy[target.eventType];
    const result = await sendFcmMessage({
      token: target.token.push_token,
      title: message.title,
      body: message.body(order.order_number ?? ""),
      data: { orderId: order.id, url: message.url, eventType: target.eventType },
    });
    return { target, result };
  }));

  for (const { target, result } of results) {
    outcomes.set(`${target.eventType}:${target.token.id}`, result.ok
      ? { status: "submitted", messageId: result.messageId, error: null, tokenInvalid: false, payload: { name: result.messageId } }
      : { status: "failed", messageId: null, error: result.error, tokenInvalid: result.tokenInvalid, payload: { error: result.error } });
  }
  return outcomes;
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  const corsHeaders = { ...buildCorsHeaders(request), "Content-Type": "application/json" };
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
  const accessToken = authorization.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: userError } = await service.auth.getUser(accessToken);
    if (userError || !user) return new Response(JSON.stringify({ error: "Invalid user session" }), { status: 401, headers: corsHeaders });
    const body = await request.json() as { order_id?: string; status?: string };
    if (!body.order_id || !["shipped", "delivered"].includes(body.status ?? "")) return new Response(JSON.stringify({ error: "Unsupported event" }), { status: 400, headers: corsHeaders });
    const status = body.status as DeliveryStatus;
    const { data: orderData, error: orderError } = await service.from("orders").select("id,order_number,customer_id,driver_id,status").eq("id", body.order_id).maybeSingle();
    const order = orderData as OrderRow | null;
    if (orderError || !order || order.status !== status) return new Response(JSON.stringify({ error: "Order state does not match event" }), { status: 409, headers: corsHeaders });
    const [{ data: profile }, { data: driver }] = await Promise.all([service.from("profiles").select("role").eq("id", user.id).maybeSingle(), service.from("drivers").select("id").eq("user_id", user.id).maybeSingle()]);
    const permitted = profile?.role === "admin" || (driver?.id && driver.id === order.driver_id);
    if (!permitted) return new Response(JSON.stringify({ error: "Caller is not assigned to this order" }), { status: 403, headers: corsHeaders });

    const { data: tokens, error: tokenError } = await service.from("customer_push_tokens")
      .select("id,provider,push_token,expo_push_token")
      .eq("customer_id", order.customer_id)
      .eq("is_active", true);
    if (tokenError) throw tokenError;
    if (!tokens?.length) return new Response(JSON.stringify({ queued: 0, reason: "No registered device" }), { status: 202, headers: corsHeaders });

    const eventTypes: PushEvent[] = status === "delivered" ? ["delivered", "review_request"] : ["shipped"];
    const { data: previous } = await service.from("push_notification_deliveries").select("push_token_id,event_type").eq("order_id", order.id).in("event_type", eventTypes);
    const alreadySent = new Set((previous ?? []).map((item) => `${item.event_type}:${item.push_token_id}`));
    const targets: Target[] = (tokens as PushToken[]).flatMap((token) =>
      eventTypes.filter((eventType) => !alreadySent.has(`${eventType}:${token.id}`)).map((eventType) => ({ token, eventType })));
    if (!targets.length) return new Response(JSON.stringify({ queued: 0, reason: "Already submitted" }), { status: 202, headers: corsHeaders });

    // One provider failing must not stop the other: a customer with an old Expo install and a new
    // Capacitor install should still hear about their order.
    const [expoOutcomes, fcmOutcomes] = await Promise.all([
      dispatchExpo(targets.filter(({ token }) => token.provider === "expo"), order),
      dispatchFcm(targets.filter(({ token }) => token.provider === "fcm"), order),
    ]);
    const outcomes = new Map([...expoOutcomes, ...fcmOutcomes]);

    const logs = targets.map(({ token, eventType }) => {
      const outcome = outcomes.get(`${eventType}:${token.id}`);
      return {
        order_id: order.id,
        customer_id: order.customer_id,
        push_token_id: token.id,
        event_type: eventType,
        provider: token.provider,
        status: outcome?.status ?? "failed",
        // expo_ticket_id is kept for continuity with rows logged before this change.
        expo_ticket_id: token.provider === "expo" ? outcome?.messageId ?? null : null,
        provider_message_id: outcome?.messageId ?? null,
        error_message: outcome?.error ?? "No dispatch outcome recorded",
        response_payload: outcome?.payload ?? {},
      };
    });
    await service.from("push_notification_deliveries").upsert(logs, { onConflict: "order_id,event_type,push_token_id", ignoreDuplicates: true });

    const invalidIds = targets
      .filter(({ token, eventType }) => outcomes.get(`${eventType}:${token.id}`)?.tokenInvalid)
      .map(({ token }) => token.id);
    if (invalidIds.length) await service.from("customer_push_tokens").update({ is_active: false, invalidated_at: new Date().toISOString() }).in("id", invalidIds);

    const submitted = logs.filter((log) => log.status === "submitted").length;
    return new Response(JSON.stringify({
      queued: targets.length,
      submitted,
      failed: targets.length - submitted,
      events: eventTypes,
    }), { status: 202, headers: corsHeaders });
  } catch (error) {
    console.error("order-status-push", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});
