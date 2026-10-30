// Repositories barrel — centralizes all data-access exports.
export { fetchProducts, fetchProduct, mapProduct, imgUrl, imgSrcSet, imgRenderUrl, imgRenderSrcSet } from './productRepository';
export { fetchOffers, fetchBanners, fetchCollections, fetchCategories, fetchBrands, fetchPaymentMethods, fetchDeliveryZones } from './catalogRepository';
export { fetchMyOrders, fetchMyOrder, fetchOrderHistory, subscribeToOrder, cancelMyOrder, issueDeliveryCode, checkout, previewCartPricing, previewCoupon, previewDeliveryQuote, uploadPaymentProof, submitPaymentProof, fetchMyDelivery, fetchOrderReturns, requestReturn, ORDER_PAGE_SIZE } from './orderRepository';
export type { CheckoutInput, CheckoutItem, CheckoutResult, DeliveryView, ReturnRequestInput } from './orderRepository';
export { fetchNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from './notificationRepository';
export { fetchProductReviews, fetchReviewableItems, submitReview, REVIEW_PAGE_SIZE } from './reviewRepository';
export type { ReviewPage } from './reviewRepository';
export { askBeautyAdvice } from './aiRepository';
export { fetchMyDeliveries, fetchMyDelivery as fetchDriverDelivery, fetchMyDriverProfile, setMyAvailability, updateMyDeliveryStatus, uploadDeliveryProof, uploadDriverCodReceipt, fetchPickupChecks, driverSetPickupCheck, fetchMyDriverSummary, shareMyLocation, clearMyLocation, subscribeToMyDeliveries, fetchMyCashPosition, submitDriverCashRemittance } from './driverRepository';
export type { Delivery, DeliveryItem, DeliveryStatus, DriverProfile, DriverSummary, PickupCheck, CashPosition, CashPositionEntry } from './driverRepository';
export { fetchLoyaltyProfile, subscribeRestock } from './loyaltyRepository';
export { fetchMyAddresses, saveMyAddress } from './addressRepository';
export type { NewCustomerAddress } from './addressRepository';
