// Repositories barrel — centralizes all data-access exports.
export { fetchProducts, fetchProduct, mapProduct, imgUrl, imgSrcSet } from './productRepository';
export { fetchOffers, fetchBanners, fetchCollections, fetchPaymentMethods, fetchDeliveryZones } from './catalogRepository';
export { fetchMyOrders, fetchMyOrder, fetchOrderHistory, subscribeToOrder, cancelMyOrder, checkout, previewCoupon, previewDeliveryQuote, uploadPaymentProof, submitPaymentProof, fetchMyDelivery, fetchOrderReturns, requestReturn } from './orderRepository';
export type { CheckoutInput, CheckoutItem, CheckoutResult, DeliveryView, ReturnRequestInput } from './orderRepository';
export { fetchNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from './notificationRepository';
export { fetchProductReviews, fetchReviewableItems, submitReview } from './reviewRepository';
export { askBeautyAdvice } from './aiRepository';
export { fetchMyDeliveries, fetchMyDelivery as fetchDriverDelivery, fetchMyDriverProfile, setMyAvailability, updateMyDeliveryStatus, shareMyLocation, clearMyLocation, subscribeToMyDeliveries } from './driverRepository';
export type { Delivery, DeliveryItem, DeliveryStatus, DriverProfile } from './driverRepository';
export { fetchSupervisorProfile, fetchSupervisorOrders, fetchSupervisorInventory } from './supervisorRepository';
export type { SupervisorProfile, SupervisorOrder, SupervisorInventoryRow } from './supervisorRepository';
