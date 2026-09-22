import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, Search, Package, BarChart3, Boxes, EyeOff, Eye } from 'lucide-react';
import type { Product } from '../../types';
import { fetchAdminProducts, setProductActive } from '../../lib/catalogApi';
import { errorMessage } from '../../lib/errors';
import { formatSDG } from '../../lib/format';
import { Card, Notice, PageHeader, Spinner, Table, StatusPill, primaryButtonClass, smallButtonClass } from '../../components/ui';

export const ProductListPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setProducts(await fetchAdminProducts());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المنتجات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const toggleActive = async (product: Product) => {
        setBusyId(product.id);
        setError(null);
        try {
            await setProductActive(product.id, !product.is_active);
            setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: !product.is_active } : p));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return products.filter((p) => (showInactive || p.is_active) && (
            !term || p.name_ar.includes(searchTerm.trim()) || p.name_en.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term)
        ));
    }, [products, searchTerm, showInactive]);

    const activeProducts = products.filter((p) => p.is_active);
    const stockValue = activeProducts.reduce((acc, p) => acc + p.price * p.stock, 0);
    const lowStock = activeProducts.filter((p) => p.stock <= 5).length;

    if (loading) return <Spinner label="جاري تحميل المنتجات..." />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المنتجات"
                subtitle="إدارة الكتالوج والأسعار. المخزون يُدار من صفحة المخزون."
                icon={<Package className="w-8 h-8 text-brand-blue" />}
                actions={<Link to="/products/new" className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة منتج</Link>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-blue-50 text-brand-blue rounded-2xl flex items-center justify-center"><BarChart3 className="w-7 h-7" /></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">منتجات نشطة</p><h4 className="text-2xl font-black text-slate-900">{activeProducts.length}</h4></div>
                </Card>
                <Card className="p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center"><Boxes className="w-7 h-7" /></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">قيمة المخزون بسعر البيع</p><h4 className="text-2xl font-black text-slate-900">{formatSDG(stockValue)}</h4></div>
                </Card>
                <Card className="p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center"><Package className="w-7 h-7" /></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">مخزون منخفض (≤5)</p><h4 className="text-2xl font-black text-slate-900">{lowStock}</h4></div>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            placeholder="البحث بالاسم أو الماركة..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-5 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-medium text-sm"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="w-4 h-4 accent-brand-blue" />
                        إظهار المنتجات المتوقفة
                    </label>
                </div>

                <Table headers={['المنتج', 'التصنيف', 'السعر', 'المخزون', 'الحالة', 'الإجراءات']} empty={filtered.length === 0} emptyText="لا توجد منتجات مطابقة">
                    {filtered.map((product) => {
                        const margin = product.price > 0 ? ((product.price - product.cost_price) / product.price) * 100 : null;
                        return (
                            <tr key={product.id} className={`hover:bg-slate-50/50 transition-all ${product.is_active ? '' : 'opacity-50'}`}>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <img src={product.image || product.images[0]} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100 bg-slate-50" />
                                        <div>
                                            <p className="font-black text-slate-900 text-sm">{product.name_ar}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">{product.brand}{product.is_imported ? ' · مستورد' : ''}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black">{product.category || '—'}</span></td>
                                <td className="px-6 py-4">
                                    <p className="font-black text-slate-900 text-sm">{formatSDG(product.price)}</p>
                                    {product.discount_percentage > 0 && <p className="text-[10px] text-red-500 font-bold">خصم {product.discount_percentage}%</p>}
                                    {margin !== null && <p className="text-[10px] text-emerald-600 font-bold">هامش {margin.toFixed(0)}%</p>}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${product.stock > 10 ? 'bg-emerald-500' : product.stock > 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
                                        <span className={`text-sm font-black ${product.stock === 0 ? 'text-red-500' : 'text-slate-700'}`}>{product.stock > 0 ? `${product.stock} قطعة` : 'نفدت الكمية'}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><StatusPill tone={product.is_active ? 'success' : 'neutral'}>{product.is_active ? 'نشط' : 'متوقف'}</StatusPill></td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <Link to={`/products/edit/${product.id}`} className="min-w-11 min-h-11 flex items-center justify-center text-slate-500 hover:text-brand-blue hover:bg-blue-50 rounded-xl transition-all" aria-label="تعديل"><Edit className="w-5 h-5" /></Link>
                                        <button
                                            type="button"
                                            disabled={busyId === product.id}
                                            onClick={() => void toggleActive(product)}
                                            className={`${smallButtonClass} flex items-center gap-1 ${product.is_active ? 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                        >
                                            {product.is_active ? <><EyeOff className="w-3.5 h-3.5" /> إيقاف</> : <><Eye className="w-3.5 h-3.5" /> تفعيل</>}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Card>
        </div>
    );
};
