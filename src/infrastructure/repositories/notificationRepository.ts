import { supabase } from '../supabase/client';
import type { CustomerNotification } from '../../domain/entities';

// Notifications --------------------------------------------------------------------------------
// The customer reads their own rows (own-row policy); read state goes through the RPCs.

const NOTIFICATION_COLUMNS = 'id,type,title_ar,body_ar,order_id,product_id,payload,is_read,created_at';

type NotificationRow = { id: string; type: string; title_ar: string; body_ar: string; order_id: string | null; product_id: string | null; payload: unknown; is_read: boolean; created_at: string };

function mapNotification(row: NotificationRow): CustomerNotification {
    const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as { url?: unknown };
    return {
        id: row.id,
        type: row.type,
        title: row.title_ar,
        body: row.body_ar,
        orderId: row.order_id,
        productId: row.product_id,
        url: typeof payload.url === 'string' ? payload.url : null,
        isRead: row.is_read,
        createdAt: row.created_at,
    };
}

export async function fetchNotifications(limit = 50): Promise<CustomerNotification[]> {
    const { data, error } = await supabase.from('customer_notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
    if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
    const { data, error } = await supabase.rpc('mark_all_notifications_read');
    if (error) throw error;
    return Number(data ?? 0);
}

// Realtime on the customer's own rows (the table is in the publication; RLS scopes the stream).
// Debounced like the admin's order subscription so a burst of trigger writes reloads once.
export function subscribeToNotifications(customerId: string, onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
        .channel(`notifications-${customerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_notifications', filter: `customer_id=eq.${customerId}` }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(onChange, 400);
        })
        .subscribe();
    return () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
    };
}
