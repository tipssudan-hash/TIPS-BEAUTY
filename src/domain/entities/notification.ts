// An in-app message to the customer, written by backend triggers (order events, review request,
// back in stock) and later by staff broadcasts. `type` drives the icon and the destination.
export interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  orderId: string | null;
  productId: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}
