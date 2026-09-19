import React, { useState } from 'react';
import { ShoppingCart, User, LogOut, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
    cartCount: number;
}

export const Header: React.FC<HeaderProps> = ({ cartCount }) => {
    const location = useLocation();
    const currentPath = location.pathname;
    const { user, signOut } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md shadow-sm border-b border-brand-blue-soft">
            <div className="max-w-4xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 cursor-pointer group">
                        <img src="/logo.PNG" alt="Tips Beauty" className="h-16 md:h-24 w-auto object-contain hover:scale-105 transition-transform duration-300 mix-blend-multiply" />
                    </Link>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="md:hidden p-2 text-gray-600 hover:text-brand-blue transition-colors"
                    >
                        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                        <Link to="/" className={`hover:text-brand-blue transition-colors ${currentPath === '/' ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>الرئيسية</Link>
                        <Link to="/ai-chat" className={`flex items-center gap-1 hover:text-brand-blue transition-colors ${currentPath === '/ai-chat' ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>
                            <span className="bg-brand-blue-soft text-brand-blue px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">AI</span> مساعدي
                        </Link>
                        {user && (
                            <Link to="/orders" className={`hover:text-brand-blue transition-colors ${currentPath.startsWith('/orders') ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>طلباتي</Link>
                        )}

                        {user ? (
                            <div className="flex items-center gap-4 border-r border-gray-100 pr-4 mr-2">
                                <Link to="/settings" className={`flex items-center gap-2 hover:text-brand-blue transition-colors ${currentPath === '/settings' ? 'text-brand-blue font-bold' : 'text-gray-600'}`}>
                                    <User className="w-4 h-4" />
                                    <span>حسابي</span>
                                </Link>
                                <button
                                    onClick={signOut}
                                    className="text-gray-500 hover:text-red-500 transition-colors"
                                    title="تسجيل الخروج"
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 border-r border-gray-100 pr-4 mr-2">
                                <Link to="/login" className="text-gray-600 hover:text-brand-blue font-medium transition-colors">دخول</Link>
                                <Link to="/signup" className="bg-brand-blue text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-sky-700 transition-all shadow-md shadow-brand-blue-soft hover:shadow-lg hover:shadow-brand-blue-soft">انضمي إلينا</Link>
                            </div>
                        )}

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
                    <nav className="md:hidden pt-4 pb-2 flex flex-col gap-3 text-sm border-t border-gray-100 mt-3 animate-in fade-in slide-in-from-top-2">
                        <Link to="/" className={`p-2 rounded-lg ${currentPath === '/' ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>الرئيسية</Link>
                        <Link to="/ai-chat" className={`p-2 rounded-lg flex items-center gap-2 ${currentPath === '/ai-chat' ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>
                            <span className="bg-brand-blue-soft text-brand-blue px-1.5 py-0.5 rounded text-[10px] font-bold">AI</span> مساعدي
                        </Link>
                        {user && (
                            <Link to="/orders" className={`p-2 rounded-lg ${currentPath.startsWith('/orders') ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>طلباتي</Link>
                        )}

                        <div className="border-t border-gray-100 my-1"></div>

                        {user ? (
                            <>
                                <Link to="/settings" className={`p-2 rounded-lg flex items-center gap-2 ${currentPath === '/settings' ? 'bg-brand-blue-soft text-brand-blue font-bold' : 'text-gray-600'}`} onClick={() => setIsMenuOpen(false)}>
                                    <User className="w-4 h-4" /> حسابي
                                </Link>
                                <button onClick={() => { signOut(); setIsMenuOpen(false); }} className="p-2 rounded-lg flex items-center gap-2 text-red-500 hover:bg-red-50 w-full text-right">
                                    <LogOut className="w-4 h-4" /> تسجيل الخروج
                                </button>
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
