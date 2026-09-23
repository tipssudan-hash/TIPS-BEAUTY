import { describe, expect, it } from "vitest";

describe("TIPS Beauty Supabase configuration", () => {
  it("connects with the supplied public credentials", async () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(url).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(key).toBeTruthy();
    const headers = { apikey: key!, Authorization: `Bearer ${key}` };
    const [paymentMethods, products] = await Promise.all([
      fetch(`${url}/rest/v1/payment_methods?select=code&limit=1`, { headers }),
      fetch(`${url}/rest/v1/rpc/get_public_products`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" }),
    ]);
    expect(paymentMethods.ok).toBe(true);
    expect(products.ok).toBe(true);
  });
});
