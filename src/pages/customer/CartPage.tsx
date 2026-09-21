import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { cartLineKey, cartUnitPrice } from '../../lib/pricing';
import { formatSDG } from '../../lib/format';

export const CartPage: React.FC = () => {
    const { cart, products, removeFromCart, updateQuantity } = useStore();
    const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

    const subtotal = cart.reduce((sum, item) => sum + cartUnitPrice(item, live.get(item.productId)) * item.quantity, 0);

    if (cart.length === 0) {
        return (
            <div className="max-w-4xl mx-auto p-8 text-center">
                <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-12">
                    <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">السلة فارغة</h2>
                    <p className="text-gray-600 mb-6">لم تضيفي أي منتجات بعد</p>
                    <Link
                        to="/"
                        className="inline-block bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all"
                    >
                        تسوقي الآن
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4">
            <div className="mb-4">
                <Link to="/" className="text-brand-blue text-sm hover:underline">
                    ← متابعة التسوق
                </Link>
            </div>

            <h1 className="text-2xl font-bold text-gray-800 mb-6">سلة التسوق</h1>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Cart Items */}
                <div className="md:col-span-2 space-y-4">
                    {cart.map((item) => (
                        <div
                            key={cartLineKey(item)}
                            className="bg-white rounded-xl shadow-sm border border-brand-blue-soft p-4 flex gap-4"
                        >
                            <img
                                src={item.image}
                                alt={item.name_ar}
                                className="w-24 h-24 object-cover rounded-lg"
                            />
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800 mb-1">{item.name_ar}</h3>
                                {item.variantName && <p className="text-xs text-gray-500 mb-1">الخيار: {item.variantName}</p>}
                                <p className="text-brand-blue font-bold">
                                    {formatSDG(cartUnitPrice(item, live.get(item.productId)))}
                                </p>
                            </div>
                            <div className="flex flex-col items-end justify-between">
                                <button
                                    aria-label="إزالة"
                                    onClick={() => removeFromCart(cartLineKey(item))}
                                    className="text-red-500 hover:text-red-700 p-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-2 bg-gray-50 rounded-lg">
                                    <button
                                        aria-label="تقليل الكمية"
                                        onClick={() => updateQuantity(cartLineKey(item), item.quantity - 1)}
                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                                    <button
                                        aria-label="زيادة الكمية"
                                        onClick={() => updateQuantity(cartLineKey(item), item.quantity + 1)}
                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="md:col-span-1">
                    <div className="bg-white rounded-xl shadow-sm border border-brand-blue-soft p-6 sticky top-4">
                        <h2 className="font-bold text-gray-800 mb-4">ملخص الطلب</h2>
                        <div className="space-y-3 mb-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">المجموع الفرعي:</span>
                                <span className="font-semibold">{formatSDG(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">التوصيل:</span>
                                <span className="text-gray-500 text-xs">يُحدد حسب منطقتك عند إتمام الطلب</span>
                            </div>
                        </div>
                        <Link to="/checkout" className="block w-full text-center bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-100">
                            إتمام الطلب
                        </Link>
                        <p className="text-xs text-gray-500 text-center mt-3">
                            سيتم التواصل معك لتأكيد الطلب
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
