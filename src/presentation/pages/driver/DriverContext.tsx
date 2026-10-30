import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMyDeliveries, fetchMyDriverProfile, setMyAvailability, subscribeToMyDeliveries, type Delivery, type DriverProfile } from '@infrastructure/repositories';
import { driverActionQueue } from '@infrastructure/offline/driverQueue';
import type { DraftAction, QueuedAction } from '@infrastructure/offline/driverActionQueue';
import { useLocationSharing, type LocationSharingState } from '../../hooks/useLocationSharing';
import { errorMessage } from '@application/errors';

// One feed for the driver surface: profile, assigned deliveries (Realtime + poll), the online
// toggle, location sharing that switches itself on while a delivery is on the road, and the
// offline queue that holds pickup checks and shipped / failed updates until the connection returns.

interface DriverContextType {
    profile: DriverProfile | null;
    deliveries: Delivery[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    setOnline: (online: boolean) => Promise<void>;
    sharing: LocationSharingState;
    lastSentAt: Date | null;
    isOnline: boolean;
    queued: QueuedAction[];
    queueNotice: string | null;
    submitAction: (draft: DraftAction) => Promise<'sent' | 'queued'>;
}

const DriverContext = createContext<DriverContextType | undefined>(undefined);

const QUEUE_NOTICE_MS = 8_000;

export const DriverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profile, setProfile] = useState<DriverProfile | null>(null);
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [queued, setQueued] = useState<QueuedAction[]>([]);
    const [queueNotice, setQueueNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [p, d] = await Promise.all([fetchMyDriverProfile(), fetchMyDeliveries()]);
            setProfile(p);
            setDeliveries(d);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل التوصيلات.'));
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshQueue = useCallback(async () => {
        try {
            setQueued(await driverActionQueue.list());
        } catch (err) {
            console.error('driver_queue_list', err);
        }
    }, []);

    const replayQueue = useCallback(async () => {
        try {
            const report = await driverActionQueue.replay();
            setQueued(report.remaining);
            if (report.dropped.length > 0) {
                const reason = errorMessage(report.dropped[0].error, 'لم يعد هذا الإجراء ممكناً لهذا الطلب.');
                setQueueNotice(`أُلغي ${report.dropped.length} إجراء محفوظ على الجهاز: ${reason}`);
            }
            if (report.sent > 0 || report.dropped.length > 0) void refresh();
        } catch (err) {
            console.error('driver_queue_replay', err);
        }
    }, [refresh]);

    useEffect(() => {
        void refresh();
        const unsubscribe = subscribeToMyDeliveries(() => { void refresh(); });
        const poll = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
        return () => { unsubscribe(); clearInterval(poll); };
    }, [refresh]);

    useEffect(() => {
        const goOnline = () => { setIsOnline(true); void replayQueue(); };
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        void refreshQueue();
        if (navigator.onLine) void replayQueue();
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, [refreshQueue, replayQueue]);

    useEffect(() => {
        if (!queueNotice) return;
        const timer = setTimeout(() => setQueueNotice(null), QUEUE_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [queueNotice]);

    const submitAction = useCallback(async (draft: DraftAction) => {
        return driverActionQueue.submit(draft).finally(() => { void refreshQueue(); });
    }, [refreshQueue]);

    const setOnline = useCallback(async (online: boolean) => {
        if (!online && deliveries.some((d) => d.status === 'shipped')) {
            throw new Error('لا يمكن إيقاف التوفر والطلب في الطريق.');
        }
        await setMyAvailability(online ? 'active' : 'offline');
        await refresh();
    }, [deliveries, refresh]);

    const onTheRoad = useMemo(() => deliveries.some((d) => d.status === 'shipped'), [deliveries]);
    const { state: sharing, lastSentAt } = useLocationSharing(onTheRoad && profile?.status !== 'offline');

    return (
        <DriverContext.Provider value={{
            profile,
            deliveries,
            loading,
            error,
            refresh,
            setOnline,
            sharing,
            lastSentAt,
            isOnline,
            queued,
            queueNotice,
            submitAction,
        }}>
            {children}
        </DriverContext.Provider>
    );
};

export const useDriver = () => {
    const context = useContext(DriverContext);
    if (!context) throw new Error('useDriver must be used within a DriverProvider');
    return context;
};
