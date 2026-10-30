import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, Search, Package, BarChart3, Boxes, EyeOff, Eye } from 'lucide-react';
import type { Brand, Category, Product } from '../../types';
import { bulkAssignProductCategory, bulkSetProductsActive, fetchAdminProductsPage, fetchBrands, fetchCategories, setProductActive } from '../../lib/catalogApi';
import { categoryAndChildIds, categoryPathLabel } from '../../lib/categoryTree';
import { errorMessage } from '../../lib/errors';
import { formatSDG } from '../../lib/format';
import { PAGE_SIZE } from '../../lib/pagination';
import { Card, Notice, PageHeader, Spinner, Table, StatusPill, primaryButtonClass, smallButtonClass } from '../../components/ui';
import { Pagination } from '../../components/Pagination';
import { BulkActionBar } from '../../components/BulkActionBar';
import { useRowSelection } from '../../hooks/useRowSelection';

export const ProductListPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [total, setTotal] = useState(0);
    const [categories, setCategories] = useState<Category[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [busy, setBusy] = useState(false);
    const [bulkCategory, setBulkCategory] = useState('');
    const selection = useRowSelection();
    const searchTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchCategories(), fetchBrands()])
            .then(([categoryList, brandList]) => {
                if (cancelled) return;
                setCategories(categoryList);
                setBrands(brandList);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المنتجات.'));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchAdminProductsPage({ search, page, pageSize: PAGE_SIZE })
            .then((result) => {
                if (cancelled) return;
                setProducts(result.rows);
                setTotal(result.total);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المنتجات.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [search, page, reloadKey]);

    const onSearchInput = (value: string) => {
        setSearchTerm(value);
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            selection.clear();
            setPage(0);
            setSearch(value.trim());
        }, 300);
    };

    const changePage = (value: number) => {
        selection.clear();
        setPage(value);
    };

    const toggleActive = async (product: Product) => {
        setBusy(true);
        setError(null);
        try {
            await setProductActive(product.id, !product.is_active);
            setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: !product.is_active } : p));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const runBulk = async (action: () => Promise<number>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            selection.clear();
            setReloadKey((k) => k + 1);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const filtered = useMemo(() => {
        const categoryIds = categoryFilter ? categoryAndChildIds(categories, categoryFilter) : null;
        return products.filter((p) => (showInactive || p.is_active)
            && (!categoryIds || (p.category_id !== null && categoryIds.has(p.category_id)))
            && (!brandFilter || p.brand_id === brandFilter));
    }, [products, categories, categoryFilter, brandFilter, showInactive]);

    const visibleIds = filtered.map((p) => p.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.selected.has(id));
    const activeProducts = products.filter((p) => p.is_active);
    const stockValue = activeProducts.reduce((acc, p) => acc + p.price * p.stock, 0);
    const lowStock = activeProducts.filter((p) => p.stock <= 5).length;

    if (loading && products.length === 0) return <Spinner label="جاري تحميل المنتجات..." />;

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
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">منتجات نشطة (الصفحة)</p><h4 className="text-2xl font-black text-slate-900">{activeProducts.length}</h4></div>
                </Card>
                <Card className="p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center"><Boxes className="w-7 h-7" /></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">قيمة المخزون بسعر البيع (الصفحة)</p><h4 className="text-2xl font-black text-slate-900">{formatSDG(stockValue)}</h4></div>
                </Card>
                <Card className="p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center"><Package className="w-7 h-7" /></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">مخزون منخفض ≤5 (الصفحة)</p><h4 className="text-2xl font-black text-slate-900">{lowStock}</h4></div>
                </Card>
            </div>

            <BulkActionBar count={selection.selectedIds.length} onClear={selection.clear} busy={busy}>
                <button type="button" disabled={busy} onClick={() => void runBulk(() => bulkSetProductsActive(selection.selectedIds, true))} className={`${smallButtonClass} bg-emerald-50 text-emerald-700`}>تفعيل المحدد</button>
                <button type="button" disabled={busy} onClick={() => void runBulk(() => bulkSetProductsActive(selection.selectedIds, false))} className={`${smallButtonClass} bg-slate-100 text-slate-700`}>إيقاف المحدد</button>
                <select aria-label="التصنيف للتعيين الجماعي" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold">
                    <option value="">اختر تصنيفاً</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{categoryPathLabel(c, categories)}</option>)}
                </select>
                <button type="button" disabled={busy || !bulkCategory} onClick={() => void runBulk(() => bulkAssignProductCategory(selection.selectedIds, bulkCategory))} className={`${smallButtonClass} bg-slate-900 text-white`}>تعيين التصنيف</button>
            </BulkActionBar>

            <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            placeholder="البحث بالاسم أو الماركة..."
                            value={searchTerm}
                            onChange={(e) => onSearchInput(e.target.value)}
                            className="w-full pl-12 pr-5 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-medium text-sm"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <select aria-label="تصفية حسب التصنيف" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-medium text-sm">
                            <option value="">كل التصنيفات</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{categoryPathLabel(c, categories)}</option>)}
                        </select>
                        <select aria-label="تصفية حسب العلامة" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-medium text-sm">
                            <option value="">كل العلامات</option>
                            {brands.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
                        </select>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="w-4 h-4 accent-brand-blue" />
                            إظهار المنتجات المتوقفة
                        </label>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                            <input type="checkbox" checked={allVisibleSelected} disabled={visibleIds.length === 0} onChange={(e) => selection.toggleAll(visibleIds, e.target.checked)} className="w-4 h-4 accent-brand-blue" />
                            تحديد الصفحة
                        </label>
                    </div>
                </div>

                <Table headers={['', 'المنتج', 'التصنيف', 'السعر', 'المخزون', 'الحالة', 'الإجراءات']} empty={filtered.length === 0 && !loading} emptyText="لا توجد منتجات مطابقة">
                    {filtered.map((product) => {
                        const cost = product.average_cost ?? product.cost_price;
                        const margin = product.price > 0 ? ((product.price - cost) / product.price) * 100 : null;
                        return (
                            <tr key={product.id} className={`hover:bg-slate-50/50 transition-all ${product.is_active ? '' : 'opacity-50'}`}>
                                <td className="px-4 py-4">
                                    <input type="checkbox" aria-label="تحديد المنتج" checked={selection.selected.has(product.id)} onChange={() => selection.toggle(product.id)} />
                                </td>
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
                                            disabled={busy}
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
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={changePage} loading={loading} />
            </Card>
        </div>
    );
};
