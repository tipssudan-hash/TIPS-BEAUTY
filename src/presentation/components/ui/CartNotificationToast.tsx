import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, CheckCircle, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatSDG } from '@application/services/format';

export const CartNotificationToast: React.FC = () => {
    const { cartNotification, dismissCartNotification } = useStore();

    if (!cartNotification) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-white rounded-2xl shadow-2xl border border-brand-blue-soft p-3 sm:p-4 flex items-center gap-3 animate-slideUp transition-all duration-300 backdrop-blur-md"
        >
            <div className="relative shrink-0">
                <img
                    src={cartNotification.image}
                    alt={cartNotification.productName}
                    className="w-12 h-12 object-cover rounded-xl bg-gray-50 border border-gray-100"
                />
                <span className="absolute -top-1 -right-1 bg-green-500 text-white p-0.5 rounded-full shadow-xs">
                    <CheckCircle className="w-3.5 h-3.5 fill-current" />
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-green-700 flex items-center gap-1">
                    تمت الإضافة إلى السلة
                </p>
                <h4 className="text-sm font-bold text-gray-800 truncate">
                    {cartNotification.productName}
                </h4>
                {cartNotification.variantName && (
                    <p className="text-[11px] text-gray-500 truncate">
                        الخيار: {cartNotification.variantName}
                    </p>
                )}
                <p className="text-xs font-black text-brand-blue">
                    {formatSDG(cartNotification.price)}
                </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                <Link
                    to="/cart"
                    onClick={dismissCartNotification}
                    className="bg-brand-blue hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition-all active:scale-95 shadow-xs"
                >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>السلة</span>
                </Link>
                <button
                    type="button"
                    onClick={dismissCartNotification}
                    aria-label="إغلاق التنبيه"
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
