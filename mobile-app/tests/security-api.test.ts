import { describe, expect, it } from "vitest";

const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const headers = { apikey: key!, Authorization: `Bearer ${key!}` };

describe("TIPS Beauty public API security", () => {
  it("exposes the customer catalog only through a limited RPC", async () => {
    const direct = await fetch(`${baseUrl}/rest/v1/products?select=*&limit=1`, { headers });
    const catalog = await fetch(`${baseUrl}/rest/v1/rpc/get_public_products`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(direct.ok).toBe(false);
    expect(catalog.ok).toBe(true);
    expect(await catalog.json()).toBeInstanceOf(Array);
  });

  it("rejects the AI service when no customer session is supplied", async () => {
    const response = await fetch(`${baseUrl}/functions/v1/beauty-advice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "اختبار" }),
    });
    expect(response.status).toBe(401);
  });

  it("does not permit an anonymous caller to create an order", async () => {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/checkout_order_with_growth`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_customer_name: "اختبار", p_phone: "000", p_shipping_address: "اختبار", p_city: "الخرطوم", p_state: "", p_payment_method: "cash", p_items: [], p_idempotency_key: "test-key" }),
    });
    expect(response.ok).toBe(false);
  });
});
