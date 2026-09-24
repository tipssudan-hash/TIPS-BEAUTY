import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Percent, Ticket, Bell } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { fetchBanners, fetchOffers } from '@infrastructure/repositories';
import { offerEndsLabel, offerScopeLabel, offerValueLabel } from '@application/services/offers';
import { ProductRow } from '../../components/ui/ProductRow';
import { EmptyState, PageState } from '../../components/ui';
import { errorMessage } from '@application/errors';
import type { Banner, Offer } from '@domain/entities';

// Everything on offer right now: each running Promotion with the Products it touches, then the
// promotional banners, then the coupon hint. Prices on the cards are the backend's effective
// prices, so what is shown here is exactly what checkout charges.

export const OffersPage: React.FC = () => {
    const { products, wishlist, addToCart, toggleWishlist } = useStore();
    const { user } = useAuth();
    const [offers, setOffers] = useState<Offer[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [o, b] = await Promise.all([fetchOffers(), fetchBanners()]);
            setOffers(o);
            setBanners(b.filter((x) => x.actionType !== 'none'));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل العروض.'));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { void load(); }, []);

    const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2"><Percent className="w-6 h-6 text-brand-blue" /> العروض</h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">الأسعار المعروضة هي ما ستدفعينه عند إتمام الطلب — لا مفاجآت.</p>
            </div>
            <PageState
                loading={loading}
                error={error}
                onRetry={() => void load()}
                empty={offers.length === 0 && banners.length === 0}
                emptyState={<EmptyState icon={<Percent className="w-7 h-7" />} title="لا توجد عروض حالياً" body="سنخبرك في الإشعارات فور بدء عرض جديد." action={user ? <Link to="/notifications" className="text-brand-blue font-bold text-sm hover:underline inline-flex items-center gap-1"><Bell className="w-4 h-4" /> الإشعارات</Link> : <Link to="/signup" className="text-brand-blue font-bold text-sm hover:underline">انضمي لتصلك العروض</Link>} />}
            >
                <div className="space-y-8">
                    {offers.map((offer) => {
                        const items = offer.productIds.map((id) => productsById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
                        return (
                            <section key={offer.id} className="bg-white rounded-card border border-brand-blue-soft p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                    <div>
                                        <p className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-600">{offerValueLabel(offer)}</p>
                                        <h2 className="mt-2 text-lg font-bold text-gray-800">{offer.title}</h2>
                                        <p className="text-sm text-gray-600">{offerScopeLabel(offer)}{offer.description ? ` · ${offer.description}` : ''}</p>
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 bg-gray-50 rounded-full px-3 py-1">{offerEndsLabel(offer)}</p>
                                </div>
                                {items.length > 0
                                    ? <ProductRow id={`offer-${offer.id}`} title="" products={items} wishlist={wishlist} onToggleWishlist={toggleWishlist} onAddToCart={addToCart} />
                                    : <Link to="/" className="text-sm font-bold text-brand-blue hover:underline">تصفحي المنتجات المشمولة</Link>}
                            </section>
                        );
                    })}

                    {banners.length > 0 && (
                        <section>
                            <h2 className="text-lg font-bold text-gray-800 mb-3">من إعلاناتنا</h2>
                            <ul className="grid gap-4 sm:grid-cols-2">
                                {banners.map((b) => (
                                    <li key={b.id}>
                                        <Link to={b.actionType === 'product' ? `/product/${b.actionValue}` : b.actionType === 'url' && b.actionValue?.startsWith('/') ? b.actionValue : '/'} className="block overflow-hidden rounded-card border border-gray-100 bg-white">
                                            <img src={b.imageUrl} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />
                                            <div className="p-3"><p className="font-bold text-gray-800 text-sm">{b.title_ar}</p>{b.subtitle_ar && <p className="text-xs text-gray-500">{b.subtitle_ar}</p>}</div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="rounded-card border border-dashed border-gray-200 p-4 text-sm text-gray-600 flex items-center gap-3">
                        <Ticket className="w-5 h-5 text-brand-blue shrink-0" />
                        <span>لديك كود خصم؟ أدخليه عند إتمام الطلب — يُطبَّق إن كان خصمه أكبر من العروض الجارية.</span>
                    </section>
                </div>
            </PageState>
        </div>
    );
};
