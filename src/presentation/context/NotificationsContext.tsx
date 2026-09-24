import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CustomerNotification } from '@domain/entities';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from '@infrastructure/repositories';
import { useAuth } from './AuthContext';

// One feed shared by the header bell and the Notifications page: loaded on login, refreshed by
// Realtime on the customer's own rows, cleared on logout.

interface NotificationsContextType {
    items: CustomerNotification[];
    unread: number;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<CustomerNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!user) { setItems([]); return; }
        try {
            setItems(await fetchNotifications());
            setError(null);
        } catch (err) {
            console.error('Failed to load notifications', err);
            setError('تعذر تحميل الإشعارات.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!user) { setItems([]); return; }
        setLoading(true);
        void refresh();
        return subscribeToNotifications(user.id, () => { void refresh(); });
    }, [user, refresh]);

    const markRead = useCallback(async (id: string) => {
        setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
        try { await markNotificationRead(id); } catch (err) { console.error('markNotificationRead', err); }
    }, []);

    const markAllRead = useCallback(async () => {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        try { await markAllNotificationsRead(); } catch (err) { console.error('markAllNotificationsRead', err); }
    }, []);

    const unread = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

    return (
        <NotificationsContext.Provider value={{ items, unread, loading, error, refresh, markRead, markAllRead }}>
            {children}
        </NotificationsContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationsContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationsProvider');
    return context;
};
