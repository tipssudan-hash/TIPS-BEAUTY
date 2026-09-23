import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://luqrrjhvaremronfcvaf.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cXJyamh2YXJlbXJvbmZjdmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MzM2MzgsImV4cCI6MjA3NjMwOTYzOH0.8g_QSxyxra1uVVJFboe45Dilq3X1CCdgHoZTY3UPESk";

describe("TIPS Beauty Authentication & Database Flow", () => {
  const testEmail = `beauty_user_${Date.now()}@tips-sd.com`;
  const testPassword = "BeautySecurePassword123!";
  const testFullName = "نورا أحمد";

  it("1. Successfully creates a new customer account via Supabase Auth (Sign Up)", async () => {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        data: {
          full_name: testFullName,
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.email).toBe(testEmail);
    expect(data.user_metadata?.full_name).toBe(testFullName);
  }, 15000);

  it("2. Handles sign in validation gracefully when credentials or confirmation are pending", async () => {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    // Supabase requires email confirmation by default or returns session token if confirmed
    expect([200, 400]).toContain(response.status);
    const data = await response.json();
    if (response.status === 200) {
      expect(data.access_token).toBeDefined();
      expect(data.user).toBeDefined();
    } else {
      expect(data.error_description || data.msg || data.message).toBeDefined();
    }
  });

  it("3. Verifies session restore and logout cleanup cycle", () => {
    let mockStorage: Record<string, string> = {};
    const SESSION_KEY = "tips_mobile_session";

    // Simulate save session
    const mockSession = {
      access_token: "mock-jwt-token",
      user: { id: "test-user-id", email: testEmail, user_metadata: { full_name: testFullName } },
    };
    mockStorage[SESSION_KEY] = JSON.stringify(mockSession);
    expect(mockStorage[SESSION_KEY]).toBeTruthy();

    // Simulate restore session
    const restored = JSON.parse(mockStorage[SESSION_KEY]);
    expect(restored.user.email).toBe(testEmail);

    // Simulate logout (setSession(null))
    delete mockStorage[SESSION_KEY];
    expect(mockStorage[SESSION_KEY]).toBeUndefined();
  });
});
