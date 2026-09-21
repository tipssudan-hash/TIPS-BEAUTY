import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingCart, Package, User } from 'lucide-react';
import { cn } from '../../lib/cn';

// Mobile-only primary navigation (DESIGN.md "Navigation"): four destinations, one tap each. Offers
// joins as a tab only once campaigns run regularly; until then it lives on the Home strip.

interface BottomNavProps {
    cartCount: number;
}

const items = [
    { to: '/', label: 'الرئيسية', icon: Home, match: (p: string) => p === '/' },
    { to: '/cart', label: 'السلة', icon: ShoppingCart, match: (p: string) => p === '/cart' || p === '/checkout' },
    { to: '/orders', label: 'طلباتي', icon: Package, match: (p: string) => p.startsWith('/orders') },
    { to: '/settings', label: 'حسابي', icon: User, match: (p: string) => p === '/settings' || p === '/login' || p === '/signup' },
];

export const BottomNav: React.FC<BottomNavProps> = ({ cartCount }) => {
    const { pathname } = useLocation();
    return (
        <nav aria-label="التنقل الرئيسي" className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-brand-blue-soft pb-safe">
            <ul className="grid grid-cols-4">
                {items.map(({ to, label, icon: Icon, match }) => {
                    const active = match(pathname);
                    return (
                        <li key={to}>
                            <Link
                                to={to}
                                aria-current={active ? 'page' : undefined}
                                className={cn('relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors', active ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue')}
                            >
                                <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
                                <span>{label}</span>
                                {to === '/cart' && cartCount > 0 && (
                                    <span className="absolute top-1.5 right-1/2 -mr-5 min-w-4 rounded-full bg-brand-green px-1 text-[10px] leading-4 text-white">{cartCount}</span>
                                )}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
