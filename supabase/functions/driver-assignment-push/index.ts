import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendFcmMessage } from "../_shared/fcm.ts";

// Sent by the on_order_driver_assigned trigger when a warehouse manager or administrator assigns an order
// to a driver. Only the driver app registers tokens with app_audience = 'driver', and it is a Capacitor app,
// so only FCM rows are targeted. Customer devices never receive this event.

type OrderRow = { id: string; order_number: string | null; driver_id: string | null; status: string; fulfillment_warehouse_id: string | null };
type DriverRow = { id: string; user_id: string | null };
type DriverToken = { id: string; push_token: string };

const copy = {
  title: "طلب جديد بانتظارك",
  body: (number: string) => `تم إسناد الطلب ${number} إليك. تفقّد قائمة التوصيل.`,
  url: "/driver",
};

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
    const body = await request.json() as { order_id?: string; driver_id?: string };
    if (!body.order_id || !body.driver_id) return new Response(JSON.stringify({ error: "Unsupported event" }), { status: 400, headers: corsHeaders });

    const { data: orderData, error: orderError } = await service.from("orders")
      .select("id,order_number,driver_id,status,fulfillment_warehouse_id")
      .eq("id", body.order_id)
      .maybeSingle();
    const order = orderData as OrderRow | null;
    if (orderError || !order || order.driver_id !== body.driver_id) {
      return new Response(JSON.stringify({ error: "Order assignment does not match event" }), { status: 409, headers: corsHeaders });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: canManageWarehouse } = await callerClient.rpc("can_manage_warehouse", { p_warehouse_id: order.fulfillment_warehouse_id });
    if (canManageWarehouse !== true) return new Response(JSON.stringify({ error: "Caller cannot assign drivers for this warehouse" }), { status: 403, headers: corsHeaders });

    const { data: driverData, error: driverError } = await service.from("drivers").select("id,user_id").eq("id", body.driver_id).maybeSingle();
    const driver = driverData as DriverRow | null;
    if (driverError || !driver) return new Response(JSON.stringify({ error: "Driver not found" }), { status: 404, headers: corsHeaders });
    if (!driver.user_id) return new Response(JSON.stringify({ queued: 0, reason: "Driver is not linked to an account" }), { status: 202, headers: corsHeaders });

    const { data: tokens, error: tokenError } = await service.from("customer_push_tokens")
      .select("id,push_token")
      .eq("customer_id", driver.user_id)
      .eq("app_audience", "driver")
      .eq("provider", "fcm")
      .eq("is_active", true);
    if (tokenError) throw tokenError;
    if (!tokens?.length) return new Response(JSON.stringify({ queued: 0, reason: "No registered device" }), { status: 202, headers: corsHeaders });

    const results = await Promise.all((tokens as DriverToken[]).map(async (token) => ({
      token,
      result: await sendFcmMessage({
        token: token.push_token,
        title: copy.title,
        body: copy.body(order.order_number ?? ""),
        data: { orderId: order.id, url: copy.url, eventType: "driver_assigned" },
      }),
    })));

    const logs = results.map(({ token, result }) => ({
      order_id: order.id,
      customer_id: driver.user_id,
      push_token_id: token.id,
      event_type: "driver_assigned",
      provider: "fcm",
      status: result.ok ? "submitted" : "failed",
      expo_ticket_id: null,
      provider_message_id: result.ok ? result.messageId : null,
      error_message: result.ok ? null : result.error,
      response_payload: result.ok ? { name: result.messageId } : { error: result.error },
    }));
    await service.from("push_notification_deliveries").upsert(logs, { onConflict: "order_id,event_type,push_token_id", ignoreDuplicates: true });

    const invalidIds = results.filter(({ result }) => !result.ok && result.tokenInvalid).map(({ token }) => token.id);
    if (invalidIds.length) await service.from("customer_push_tokens").update({ is_active: false, invalidated_at: new Date().toISOString() }).in("id", invalidIds);

    const submitted = logs.filter((log) => log.status === "submitted").length;
    return new Response(JSON.stringify({
      queued: logs.length,
      submitted,
      failed: logs.length - submitted,
      events: ["driver_assigned"],
    }), { status: 202, headers: corsHeaders });
  } catch (error) {
    console.error("driver-assignment-push", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});
