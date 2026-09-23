export type DeliveryPushEvent = "shipped" | "delivered" | "review_request";

/** Keeps the customer-facing delivery flow explicit and prevents duplicate review prompts. */
export function getDeliveryPushEvents(status: "shipped" | "delivered"): DeliveryPushEvent[] {
  return status === "delivered" ? ["delivered", "review_request"] : ["shipped"];
}

export function getReviewReminderText(orderNumber?: string | null) {
  return `تم توصيل طلبك${orderNumber ? ` رقم ${orderNumber}` : ""}. شاركينا رأيك في المنتجات التي استلمتها.`;
}

export function shouldShowReviewPrompt(status: string, eligibleItems: number) {
  return status === "delivered" && eligibleItems > 0;
}
