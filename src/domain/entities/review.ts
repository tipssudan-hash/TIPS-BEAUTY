export interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewerLabel: string;
  createdAt: string;
  verifiedPurchase: boolean;
}

export interface ReviewableItem {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  alreadyReviewed: boolean;
}
