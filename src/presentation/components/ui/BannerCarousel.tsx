import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Banner } from '@domain/entities';

// Home-page banner carousel: one scroll-snap track (RTL-aware through the browser's own scroll
// direction), dots, and an auto-advance that stops the moment the customer touches it or asks for
// reduced motion. The first image loads eagerly (it is the page's largest paint); the rest lazily.

interface BannerCarouselProps {
    banners: Banner[];
    onSelect: (banner: Banner) => void;
    intervalMs?: number;
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ banners, onSelect, intervalMs = 6000 }) => {
    const track = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);

    const scrollTo = useCallback((index: number) => {
        const el = track.current;
        if (!el) return;
        const slide = el.children[index] as HTMLElement | undefined;
        slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }, []);

    // Which slide is in view, from the scroll position (works in both text directions).
    useEffect(() => {
        const el = track.current;
        if (!el) return;
        const onScroll = () => {
            const width = el.clientWidth || 1;
            setActive(Math.min(banners.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / width))));
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [banners.length]);

    useEffect(() => {
        if (paused || banners.length < 2) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timer = setInterval(() => scrollTo((active + 1) % banners.length), intervalMs);
        return () => clearInterval(timer);
    }, [active, paused, banners.length, intervalMs, scrollTo]);

    if (banners.length === 0) return null;

    return (
        <section aria-roledescription="carousel" aria-label="العروض والإعلانات" className="relative mb-6 md:mb-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div
                ref={track}
                onPointerDown={() => setPaused(true)}
                onFocusCapture={() => setPaused(true)}
                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth rounded-2xl"
            >
                {banners.map((banner, index) => {
                    const clickable = banner.actionType !== 'none';
                    return (
                        <div key={banner.id} className="w-full shrink-0 snap-start" role="group" aria-roledescription="slide" aria-label={`${index + 1} من ${banners.length}`}>
                            <button
                                type="button"
                                disabled={!clickable}
                                onClick={() => onSelect(banner)}
                                className="relative block w-full overflow-hidden rounded-2xl bg-brand-blue-soft text-right shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-default aspect-[16/8] sm:aspect-[20/8] md:aspect-[24/8]"
                            >
                                <img
                                    src={banner.imageUrl}
                                    alt=""
                                    loading={index === 0 ? 'eager' : 'lazy'}
                                    fetchPriority={index === 0 ? 'high' : 'auto'}
                                    decoding="async"
                                    className="absolute inset-0 h-full w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-l from-black/55 via-black/20 to-transparent" />
                                <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-8 text-white">
                                    <h2 className="text-xl md:text-3xl font-bold leading-tight drop-shadow-sm">{banner.title_ar}</h2>
                                    {banner.subtitle_ar && <p className="mt-1 text-sm md:text-base opacity-90 max-w-md">{banner.subtitle_ar}</p>}
                                    {clickable && <span className="mt-3 inline-flex w-fit items-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand-blue">اكتشفي</span>}
                                </div>
                            </button>
                        </div>
                    );
                })}
            </div>
            {banners.length > 1 && (
                <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="اختيار البانر">
                    {banners.map((banner, index) => (
                        <button
                            key={banner.id}
                            type="button"
                            role="tab"
                            aria-selected={index === active}
                            aria-label={banner.title_ar}
                            onClick={() => { setPaused(true); scrollTo(index); }}
                            className={`h-2.5 rounded-full transition-all ${index === active ? 'w-6 bg-brand-blue' : 'w-2.5 bg-brand-blue/30 hover:bg-brand-blue/60'}`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
