import { describe, expect, it } from "vitest";
import { buildReturnPayload, getDeliveryFee, getDiscountedPrice, getReferralShareMessage } from "../lib/tips-api";

describe("TIPS Beauty commerce helpers", () => {
  it("calculates the discounted product price", () => {
    expect(getDiscountedPrice({ price: 100000, discount_percentage: 15 })).toBe(85000);
    expect(getDiscountedPrice({ price: 50000, discount_percentage: null })).toBe(50000);
  });

  it("builds a customer-owned return request payload", () => {
    expect(buildReturnPayload("customer-1", "order-1", "وصل المنتج تالفاً", "الصندوق متضرر")).toEqual({
      order_id: "order-1",
      customer_id: "customer-1",
      items: [],
      reason: "وصل المنتج تالفاً",
      requested_resolution: "refund",
      customer_note: "الصندوق متضرر",
      status: "requested",
    });
  });

  it("uses the configured delivery zone fee and a safe fallback", () => {
    const zones = [{ name: "الخرطوم", fee: 1500 }, { name: "بحري", fee: 1800 }];
    expect(getDeliveryFee(zones, "بحري")).toBe(1800);
    expect(getDeliveryFee(zones, "مدينة غير مهيأة")).toBe(1500);
  });

  it("builds a clear referral message from the unique code", () => {
    expect(getReferralShareMessage("TIPS-AB12CD34")).toContain("TIPS-AB12CD34");
  });
});
