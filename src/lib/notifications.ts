import type { CustomerNotification } from '../types';

// How a notification type reads and where it leads. Order events point at the order itself (the
// trigger payload only says '/orders'); everything else follows the payload url when present.

export type NotificationCategory = 'order' | 'payment' | 'delivery' | 'review' | 'restock' | 'promo' | 'general';

export function notificationCategory(type: string): NotificationCategory {
    if (type === 'review_request') return 'review';
    if (type === 'back_in_stock') return 'restock';
    if (type.startsWith('payment_')) return 'payment';
    if (type === 'order_status_shipped' || type === 'order_status_delivered' || type === 'order_status_delivery_failed') return 'delivery';
    if (type.startsWith('order_')) return 'order';
    if (type === 'promotion' || type === 'offer') return 'promo';
    return 'general';
}

export function notificationLink(n: Pick<CustomerNotification, 'type' | 'orderId' | 'productId' | 'url'>): string | null {
    if (n.type === 'review_request') return '/orders?review=1';
    if (n.orderId) return `/orders/${n.orderId}`;
    if (n.productId) return `/product/${n.productId}`;
    if (n.url && n.url.startsWith('/')) return n.url;
    return null;
}
