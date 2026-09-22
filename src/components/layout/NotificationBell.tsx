import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';

// Header bell: unread count from the shared feed; the caller hides it for signed-out visitors.
export const NotificationBell: React.FC = () => {
    const { unread } = useNotifications();
    const active = useLocation().pathname === '/notifications';
    const label = unread > 0 ? `الإشعارات، ${unread} جديدة` : 'الإشعارات';
    return (
        <Link to="/notifications" aria-label={label} className={`relative p-2 rounded-full transition-colors hover:bg-brand-blue-soft ${active ? 'text-brand-blue' : 'text-gray-600'}`}>
            <Bell className="w-5 h-5" />
            {unread > 0 && (
                <span aria-hidden="true" className="absolute -top-0.5 -left-0.5 min-w-4 rounded-full bg-brand-green px-1 text-[10px] font-bold leading-4 text-white text-center">{unread > 99 ? '99+' : unread}</span>
            )}
        </Link>
    );
};
