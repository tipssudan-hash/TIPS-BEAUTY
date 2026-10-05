import React, { useEffect, useRef, useState } from 'react';
import { ShoppingCart, User, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
    cartCount: number;
}

const MOBILE_NAV_ID = 'mobile-nav-panel';

export const Header: React.FC<HeaderProps> = ({ cartCount }) => {
    const location = useLocation();
    const currentPath = location.pathname;
    const { user } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuToggleRef = useRef<HTMLButtonElement>(null);

    // A disclosure panel (page content stays reachable behind it), not a modal — so it gets
    // Escape-to-close and focus return, not a full Tab-trap. See useFocusTrap's doc comment.
    useEffect(() => {
        if (!isMenuOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsMenuOpen(false);
                menuToggleRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isMenuOpen]);

    return (
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-xs border-b border-brand-blue-soft">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
                <div className="flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 cursor-pointer group">
                        {/* logo.PNG has no alpha channel — an explicit white card (not mix-blend-multiply,
                            which only hides pure white and left a visible tinted box) is what actually
                            composites cleanly against the translucent header. */}
                        <div className="bg-white p-1.5 sm:p-2 rounded-card shadow-card group-hover:shadow-card-glow transition-shadow">
                            <img src="/logo.PNG" alt="Tips Beauty" className="h-10 sm:h-11 md:h-12 w-auto object-contain" />
                        </div>
                    </Link>

                    {/* Mobile: bell + menu */}
                    <div className="md:hidden flex items-center gap-1">
                        {user && <NotificationBell />}
                        <button
                            ref={menuToggleRef}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            aria-label={isMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
                            aria-expanded={isMenuOpen}
                            aria-controls={MOBILE_NAV_ID}
                            className="p-2 text-gray-600 hover:text-brand-blue transition-colors"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
                        <Link to="/" className={`hover:text-brand-blue transition-colors ${currentPath === '/' ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>الرئيسية</Link>

                        {user && (
                            <Link to="/orders" className={`hover:text-brand-blue transition-colors ${currentPath.startsWith('/orders') ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>طلباتي</Link>
                        )}

                        {user ? (
                            <div className="flex items-center gap-4 border-r border-gray-100 pr-4 mr-1">
                                <Link to="/settings" className={`flex items-center gap-2 hover:text-brand-blue transition-colors ${currentPath === '/settings' ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>
                                    {((user.user_metadata?.avatar_url || user.user_metadata?.picture) as string | undefined) ? (
                                        <img
                                            src={(user.user_metadata?.avatar_url || user.user_metadata?.picture) as string}
                                            alt="Avatar"
                                            className="w-6 h-6 rounded-full object-cover border border-brand-blue/30"
                                        />
                                    ) : (
                                        <User className="w-4 h-4" />
                                    )}
                                    <span>حسابي</span>
                                </Link>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 border-r border-gray-100 pr-4 mr-1">
                                <Link to="/login" className="text-gray-600 hover:text-brand-blue font-medium transition-colors">دخول</Link>
                                <Link to="/signup" className="bg-brand-blue text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-sky-700 transition-all shadow-md shadow-brand-blue-soft hover:shadow-lg hover:shadow-brand-blue-soft">انضمي إلينا</Link>
                            </div>
                        )}

                        {user && <NotificationBell />}
                        <Link id="cart-icon-target" to="/cart" className="relative group p-2">
                            <ShoppingCart className={`w-6 h-6 transition-colors ${cartCount > 0 ? 'text-brand-blue' : 'text-gray-400 group-hover:text-brand-blue'}`} />
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-brand-green text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-sm ring-2 ring-white animate-in zoom-in duration-300">
                                    {cartCount}
                                </span>
                            )}
                        </Link>
                    </nav>
                </div>

                {/* Mobile Navigation */}
                {isMenuOpen && (
                    <nav id={MOBILE_NAV_ID} className="md:hidden pt-4 pb-2 flex flex-col gap-3 text-sm border-t border-gray-100 mt-3 animate-in fade-in slide-in-from-top-2">
                        <Link to="/" className={`p-2 rounded-lg ${currentPath === '/' ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>الرئيسية</Link>

                        {user && (
                            <Link to="/orders" className={`p-2 rounded-lg ${currentPath.startsWith('/orders') ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>طلباتي</Link>
                        )}

                        <div className="border-t border-gray-100 my-1"></div>

                        {user ? (
                            <>
                                <Link to="/settings" className={`p-2 rounded-lg flex items-center gap-2 ${currentPath === '/settings' ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>
                                    {((user.user_metadata?.avatar_url || user.user_metadata?.picture) as string | undefined) ? (
                                        <img
                                            src={(user.user_metadata?.avatar_url || user.user_metadata?.picture) as string}
                                            alt="Avatar"
                                            className="w-5 h-5 rounded-full object-cover border border-brand-blue/30"
                                        />
                                    ) : (
                                        <User className="w-4 h-4" />
                                    )}
                                    حسابي
                                </Link>
                            </>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 p-2">
                                <Link to="/login" className="text-center py-2 text-gray-600 border border-gray-200 rounded-lg hover:border-brand-blue-soft hover:text-brand-blue transition-colors" onClick={() => setIsMenuOpen(false)}>دخول</Link>
                                <Link to="/signup" className="text-center py-2 bg-brand-blue text-white rounded-lg font-bold shadow-md shadow-brand-blue-soft" onClick={() => setIsMenuOpen(false)}>انضمي إلينا</Link>
                            </div>
                        )}
                    </nav>
                )}
            </div>
        </header>
    );
};
