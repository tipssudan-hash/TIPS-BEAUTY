import { describe, expect, it } from "vitest";

describe("Expo Push configuration", () => {
  it("has a UUID project id and retains access to the public store API", async () => {
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(projectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const response = await fetch(`${baseUrl}/rest/v1/rpc/get_public_products`, { method: "POST", headers: { apikey: key!, Authorization: `Bearer ${key!}`, "Content-Type": "application/json" }, body: "{}" });
    expect(response.ok).toBe(true);
  });
});
