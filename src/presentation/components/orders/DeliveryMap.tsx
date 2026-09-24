import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// The driver's last known position on OpenStreetMap tiles (no API key). A CSS marker avoids
// Leaflet's image-asset paths under the bundler. Loaded lazily by DeliveryCard.

const driverIcon = L.divIcon({
    className: '',
    html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#005696;border:3px solid #fff;box-shadow:0 0 0 6px rgba(0,86,150,.2)"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

const DeliveryMap: React.FC<{ latitude: number; longitude: number; accuracy: number | null }> = ({ latitude, longitude, accuracy }) => {
    const host = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const marker = useRef<L.Marker | null>(null);
    const circle = useRef<L.Circle | null>(null);

    useEffect(() => {
        if (!host.current || map.current) return;
        map.current = L.map(host.current, { zoomControl: false, attributionControl: true }).setView([latitude, longitude], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map.current);
        marker.current = L.marker([latitude, longitude], { icon: driverIcon, keyboard: false }).addTo(map.current);
        return () => { map.current?.remove(); map.current = null; marker.current = null; circle.current = null; };
        // The map is created once; position updates go through the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!map.current || !marker.current) return;
        marker.current.setLatLng([latitude, longitude]);
        map.current.panTo([latitude, longitude], { animate: true });
        if (accuracy && accuracy > 30) {
            if (!circle.current) circle.current = L.circle([latitude, longitude], { radius: accuracy, color: '#005696', weight: 1, fillOpacity: 0.08 }).addTo(map.current);
            else circle.current.setLatLng([latitude, longitude]).setRadius(accuracy);
        } else if (circle.current) {
            circle.current.remove();
            circle.current = null;
        }
    }, [latitude, longitude, accuracy]);

    return <div ref={host} role="img" aria-label="موقع المندوب على الخريطة" className="h-56 w-full rounded-card overflow-hidden border border-gray-100" />;
};

export default DeliveryMap;
