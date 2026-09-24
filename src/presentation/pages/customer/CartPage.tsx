import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { cartLineKey, cartLineUnavailable, cartUnitPrice } from '@domain/valueObjects';
import { formatSDG } from '@application/services/format';
import { EmptyState, primaryButtonClass } from '../../components/ui';

export const CartPage: React.FC = () => {
    const { cart, products, removeFromCart, updateQuantity } = useStore();
    const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

    const subtotal = cart.reduce((sum, item) => sum + cartUnitPrice(item, live.get(item.productId)) * item.quantity, 0);

    if (cart.length === 0) {
        return (
            <div className="max-w-6xl mx-auto p-4 sm:p-8">
                <EmptyState
                    icon={<ShoppingBag className="w-7 h-7" />}
                    title="السلة فارغة"
                    body="لم تضيفي أي منتجات بعد"
                    action={<Link to="/" className={primaryButtonClass}>تسوقي الآن</Link>}
                />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <div className="mb-4">
                <Link to="/" className="text-brand-blue text-sm hover:underline font-medium">
                    ← متابعة التسوق
                </Link>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">سلة التسوق</h1>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                {/* Cart Items */}
                <div className="lg:col-span-8 space-y-3 sm:space-y-4">
                    {cart.map((item) => (
                        <div
                            key={cartLineKey(item)}
                            className="bg-white rounded-2xl shadow-card border border-brand-blue-soft p-3.5 sm:p-4 flex gap-3 sm:gap-4 items-center"
                        >
                            <img
                                src={item.image}
                                alt={item.name_ar}
                                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl bg-gray-50 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm sm:text-base text-gray-800 mb-1 truncate">{item.name_ar}</h3>
                                {item.variantName && <p className="text-xs text-gray-500 mb-1">الخيار: <span className="font-medium text-gray-700">{item.variantName}</span></p>}
                                {cartLineUnavailable(item, live.get(item.productId)) && <p role="alert" className="text-xs text-red-600 mb-1 font-medium">هذا الخيار لم يعد متاحاً، احذفيه من السلة</p>}
                                <p className="text-brand-blue font-black text-sm sm:text-base">
                                    {formatSDG(cartUnitPrice(item, live.get(item.productId)))}
                                </p>
                            </div>
                            <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                                <button
                                    aria-label="إزالة"
                                    onClick={() => removeFromCart(cartLineKey(item))}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-0.5">
                                    <button
                                        aria-label="تقليل الكمية"
                                        onClick={() => updateQuantity(cartLineKey(item), item.quantity - 1)}
                                        className="w-7 h-7 flex items-center justify-center hover:bg-white hover:shadow-xs rounded-lg transition-all text-gray-600"
                                    >
                                        <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="w-7 text-center font-bold text-xs sm:text-sm">{item.quantity}</span>
                                    <button
                                        aria-label="زيادة الكمية"
                                        onClick={() => updateQuantity(cartLineKey(item), item.quantity + 1)}
                                        className="w-7 h-7 flex items-center justify-center hover:bg-white hover:shadow-xs rounded-lg transition-all text-gray-600"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="lg:col-span-4">
                    <div className="bg-white rounded-2xl shadow-card border border-brand-blue-soft p-5 sm:p-6 lg:sticky lg:top-20">
                        <h2 className="font-bold text-base sm:text-lg text-gray-800 mb-4 pb-2 border-b border-gray-100">ملخص الطلب</h2>
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">المجموع الفرعي:</span>
                                <span className="font-bold text-gray-800">{formatSDG(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-xs sm:text-sm">
                                <span className="text-gray-600">التوصيل:</span>
                                <span className="text-gray-500">يُحدد حسب الولاية</span>
                            </div>
                        </div>
                        <Link to="/checkout" className="block w-full text-center bg-brand-blue hover:bg-sky-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-98 shadow-md shadow-brand-blue/20 text-sm sm:text-base">
                            إتمام الطلب
                        </Link>
                        <p className="text-xs text-gray-400 text-center mt-3">
                            الدفع آمن والتوصيل سريع لجميع الولايات
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
