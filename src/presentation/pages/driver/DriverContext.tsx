import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMyDeliveries, fetchMyDriverProfile, setMyAvailability, subscribeToMyDeliveries, type Delivery, type DriverProfile } from '@infrastructure/repositories';
import { useLocationSharing, type LocationSharingState } from '../../hooks/useLocationSharing';
import { errorMessage } from '@application/errors';

// One feed for the driver surface: profile, assigned deliveries (Realtime + poll), the online
// toggle, and location sharing that switches itself on while a delivery is on the road.

interface DriverContextType {
    profile: DriverProfile | null;
    deliveries: Delivery[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    setOnline: (online: boolean) => Promise<void>;
    sharing: LocationSharingState;
    lastSentAt: Date | null;
}

const DriverContext = createContext<DriverContextType | undefined>(undefined);

export const DriverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profile, setProfile] = useState<DriverProfile | null>(null);
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        void refresh();
        const unsubscribe = subscribeToMyDeliveries(() => { void refresh(); });
        const poll = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
        return () => { unsubscribe(); clearInterval(poll); };
    }, [refresh]);

    const setOnline = useCallback(async (online: boolean) => {
        await setMyAvailability(online ? 'active' : 'offline');
        await refresh();
    }, [refresh]);

    const onTheRoad = useMemo(() => deliveries.some((d) => d.status === 'shipped'), [deliveries]);
    const { state: sharing, lastSentAt } = useLocationSharing(onTheRoad && profile?.status !== 'offline');

    return (
        <DriverContext.Provider value={{ profile, deliveries, loading, error, refresh, setOnline, sharing, lastSentAt }}>
            {children}
        </DriverContext.Provider>
    );
};

export const useDriver = () => {
    const context = useContext(DriverContext);
    if (!context) throw new Error('useDriver must be used within a DriverProvider');
    return context;
};
