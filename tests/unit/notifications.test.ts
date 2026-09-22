import { describe, expect, it } from 'vitest';
import { notificationCategory, notificationLink } from '../../src/lib/notifications';

// Trigger payloads only say '/orders'; the Storefront derives the real destination from the row.

describe('notificationLink', () => {
    it('sends order events to the order, review requests to the reviewable list, restocks to the product', () => {
        expect(notificationLink({ type: 'order_status_shipped', orderId: 'o1', productId: null, url: '/orders' })).toBe('/orders/o1');
        expect(notificationLink({ type: 'review_request', orderId: 'o1', productId: null, url: '/orders' })).toBe('/orders?review=1');
        expect(notificationLink({ type: 'back_in_stock', orderId: null, productId: 'p1', url: '/product/p1' })).toBe('/product/p1');
        expect(notificationLink({ type: 'announcement', orderId: null, productId: null, url: '/offers' })).toBe('/offers');
        expect(notificationLink({ type: 'announcement', orderId: null, productId: null, url: 'https://evil.example' })).toBeNull();
    });
});

describe('notificationCategory', () => {
    it('groups trigger types into the icons the page shows', () => {
        expect(notificationCategory('order_created')).toBe('order');
        expect(notificationCategory('order_status_shipped')).toBe('delivery');
        expect(notificationCategory('order_status_delivery_failed')).toBe('delivery');
        expect(notificationCategory('payment_paid')).toBe('payment');
        expect(notificationCategory('review_request')).toBe('review');
        expect(notificationCategory('back_in_stock')).toBe('restock');
        expect(notificationCategory('something_else')).toBe('general');
    });
});
