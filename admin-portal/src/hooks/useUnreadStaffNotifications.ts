import { useEffect, useState } from 'react';
import { countUnreadStaffNotifications } from '../lib/adminApi';

// NotificationsPage dispatches this after marking rows read, so the bell updates without waiting for the poll.
export const STAFF_NOTIFICATIONS_CHANGED = 'staff-notifications-changed';

const POLL_INTERVAL_MS = 30_000;

export function useUnreadStaffNotifications(): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let active = true;
        const load = () => {
            countUnreadStaffNotifications()
                .then((next) => { if (active) setCount(next); })
                .catch((error) => console.error('countUnreadStaffNotifications failed', error));
        };
        load();
        const timer = setInterval(load, POLL_INTERVAL_MS);
        window.addEventListener(STAFF_NOTIFICATIONS_CHANGED, load);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener(STAFF_NOTIFICATIONS_CHANGED, load);
        };
    }, []);

    return count;
}
