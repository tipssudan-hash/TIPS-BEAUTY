import { describe, expect, it } from "vitest";
import { getDeliveryPushEvents, getReviewReminderText, shouldShowReviewPrompt } from "../lib/review-reminder";

describe("review reminder after delivery", () => {
  it("sends one review invitation only with the delivery event", () => {
    expect(getDeliveryPushEvents("shipped")).toEqual(["shipped"]);
    expect(getDeliveryPushEvents("delivered")).toEqual(["delivered", "review_request"]);
  });

  it("creates a clear Arabic review invitation for the order", () => {
    expect(getReviewReminderText("TIPS-1024")).toContain("TIPS-1024");
    expect(getReviewReminderText("TIPS-1024")).toContain("شاركينا رأيك");
  });

  it("shows product review actions only for delivered orders with eligible products", () => {
    expect(shouldShowReviewPrompt("delivered", 1)).toBe(true);
    expect(shouldShowReviewPrompt("shipped", 2)).toBe(false);
    expect(shouldShowReviewPrompt("delivered", 0)).toBe(false);
  });
});
