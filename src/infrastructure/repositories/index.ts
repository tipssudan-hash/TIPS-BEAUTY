// Repositories barrel — centralizes all data-access exports.
export { fetchProducts, fetchProduct, mapProduct } from './productRepository';
export { fetchOffers, fetchBanners, fetchCollections, fetchPaymentMethods, fetchDeliveryZones } from './catalogRepository';
export { fetchMyOrders, fetchMyOrder, fetchOrderHistory, subscribeToOrder, cancelMyOrder, checkout, previewCoupon, uploadPaymentProof, submitPaymentProof, fetchMyDelivery } from './orderRepository';
export type { CheckoutInput, CheckoutItem, CheckoutResult, DeliveryView } from './orderRepository';
export { fetchNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from './notificationRepository';
export { fetchProductReviews, fetchReviewableItems, submitReview } from './reviewRepository';
export { askBeautyAdvice } from './aiRepository';
export { fetchMyDeliveries, fetchMyDelivery as fetchDriverDelivery, fetchMyDriverProfile, setMyAvailability, updateMyDeliveryStatus, shareMyLocation, clearMyLocation, subscribeToMyDeliveries } from './driverRepository';
export type { Delivery, DeliveryItem, DeliveryStatus, DriverProfile } from './driverRepository';
