import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPinned, RefreshCw } from 'lucide-react';
import { fetchActiveWarehouses, fetchDriverLocations, type WarehouseOption } from '../lib/adminApi';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { Card, Notice, PageHeader } from '../components/ui';
import type { DriverLocation } from '../types';

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 10 * 60 * 1000;
const KHARTOUM_CENTER: [number, number] = [15.5007, 32.5599];
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const STATUS_LABELS: Record<string, string> = { active: 'متاح', busy: 'مشغول', offline: 'غير متاح' };
const STATUS_MARKER_CLASSES: Record<string, string> = { active: 'bg-emerald-500', busy: 'bg-amber-500', offline: 'bg-slate-400' };

function driverMarkerIcon(status: string): L.DivIcon {
    return L.divIcon({
        className: 'driver-map-marker',
        html: `<span class="block w-4 h-4 rounded-full border-2 border-white shadow ${STATUS_MARKER_CLASSES[status] ?? 'bg-slate-400'}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
    });
}

// Popup text is written with textContent: driver names come from the database and are never HTML.
function driverPopup(driver: DriverLocation): HTMLElement {
    const root = document.createElement('div');
    root.dir = 'rtl';
    const name = document.createElement('strong');
    name.textContent = driver.name;
    const status = document.createElement('div');
    status.textContent = `${STATUS_LABELS[driver.status] ?? driver.status} · ${formatDateTime(driver.updated_at)}`;
    const orders = document.createElement('div');
    orders.textContent = driver.active_order_numbers.length > 0
        ? `الطلبات: ${driver.active_order_numbers.join('، ')}`
        : 'لا توجد طلبات نشطة';
    root.append(name, status, orders);
    return root;
}

export const DriversMapPage: React.FC = () => {
    const { isAdmin, managedWarehouses } = useAuth();
    const [adminWarehouses, setAdminWarehouses] = useState<WarehouseOption[]>([]);
    const [warehouseId, setWarehouseId] = useState('');
    const [drivers, setDrivers] = useState<DriverLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

    const mapElementRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.LayerGroup | null>(null);
    const fittedRef = useRef(false);

    const warehouseOptions = useMemo(
        () => (isAdmin ? adminWarehouses : managedWarehouses.map((w) => ({ id: w.id, name: w.name }))),
        [isAdmin, adminWarehouses, managedWarehouses],
    );

    useEffect(() => {
        if (!isAdmin) return;
        fetchActiveWarehouses()
            .then(setAdminWarehouses)
            .catch((err) => console.error('warehouse options', err));
    }, [isAdmin]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            setDrivers(await fetchDriverLocations(warehouseId || null));
            setError(null);
            setRefreshedAt(Date.now());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل مواقع المناديب.'));
        } finally {
            setLoading(false);
        }
    }, [warehouseId]);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = null;
        const stop = () => {
            if (timer !== null) clearInterval(timer);
            timer = null;
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void load(true);
                if (timer === null) timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
            } else {
                stop();
            }
        };
        onVisibilityChange();
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            stop();
        };
    }, [load]);

    useEffect(() => {
        if (!mapElementRef.current || mapRef.current) return;
        const map = L.map(mapElementRef.current, { center: KHARTOUM_CENTER, zoom: 12 });
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        markersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        return () => {
            map.remove();
            mapRef.current = null;
            markersRef.current = null;
            fittedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const layer = markersRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        const points: [number, number][] = [];
        drivers.forEach((driver) => {
            if (!Number.isFinite(driver.latitude) || !Number.isFinite(driver.longitude)) return;
            const point: [number, number] = [driver.latitude, driver.longitude];
            points.push(point);
            L.marker(point, { icon: driverMarkerIcon(driver.status), title: driver.name })
                .bindPopup(driverPopup(driver))
                .addTo(layer);
        });
        if (!fittedRef.current && points.length > 0) {
            map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
            fittedRef.current = true;
        }
    }, [drivers]);

    const isStale = (updatedAt: string) => refreshedAt !== null && refreshedAt - Date.parse(updatedAt) > STALE_AFTER_MS;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <PageHeader
                title="خريطة المناديب"
                subtitle="مواقع المناديب الذين يشاركون موقعهم، تُحدَّث كل 20 ثانية والصفحة ظاهرة."
                icon={<MapPinned className="w-8 h-8 text-brand-blue" />}
                actions={(
                    <div className="flex items-center gap-2">
                        <select
                            value={warehouseId}
                            onChange={(e) => { setWarehouseId(e.target.value); fittedRef.current = false; }}
                            aria-label="تصفية حسب المستودع"
                            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue"
                        >
                            <option value="">كل المستودعات</option>
                            {warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
                        </button>
                    </div>
                )}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <div className="relative">
                    <div ref={mapElementRef} className="h-[420px] w-full" />
                    {!loading && drivers.length === 0 && !error && (
                        <div className="absolute inset-x-0 bottom-4 mx-auto w-fit z-[1000] bg-white/90 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-500 shadow">
                            لا يوجد مندوب يشارك موقعه الآن.
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">المندوب</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">آخر موقع</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الدقة</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الطلبات النشطة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                            {loading && drivers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : drivers.map((driver) => (
                                <tr key={driver.driver_id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-4 font-bold text-slate-900">{driver.name}</td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{STATUS_LABELS[driver.status] ?? driver.status}</td>
                                    <td className={`px-6 py-4 text-xs font-bold ${isStale(driver.updated_at) ? 'text-amber-700' : 'text-slate-500'}`}>
                                        {formatDateTime(driver.updated_at)}
                                        {isStale(driver.updated_at) && <span className="block text-[10px] font-black">موقع قديم</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                        {driver.accuracy_meters == null ? '—' : `${Math.round(driver.accuracy_meters)} م`}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-600" dir="ltr">
                                        {driver.active_order_numbers.length > 0 ? driver.active_order_numbers.join(', ') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
