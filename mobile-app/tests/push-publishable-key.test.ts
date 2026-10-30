import { describe, expect, it } from "vitest";

const liveTestsEnabled = Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL) && process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!liveTestsEnabled)("Supabase publishable mobile key", () => {
  it("can read the public product catalog without administrative access", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(baseUrl).toBeTruthy();
    expect(key).toBeTruthy();
    const response = await fetch(`${baseUrl}/rest/v1/rpc/get_public_products`, { method: "POST", headers: { apikey: key!, Authorization: `Bearer ${key!}`, "Content-Type": "application/json" }, body: "{}" });
    expect(response.ok).toBe(true);
    expect(await response.json()).toBeInstanceOf(Array);
  });
});
