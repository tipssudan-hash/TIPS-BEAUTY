import { useEffect } from 'react';

export interface PageMeta {
    title: string;
    description?: string;
    image?: string | null;
    // Path from the site root; the canonical URL is built on the current origin.
    path?: string;
    type?: 'website' | 'product';
    price?: { amount: number; currency: string } | null;
    noindex?: boolean;
}

type Restore = () => void;

// Sets a meta tag and returns how to undo it: restore the earlier content, or remove the tag if this call created it.
function upsertMeta(attribute: 'name' | 'property', key: string, content: string): Restore {
    const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (existing) {
        const previous = existing.getAttribute('content');
        existing.setAttribute('content', content);
        return () => { if (previous !== null) existing.setAttribute('content', previous); };
    }
    const created = document.createElement('meta');
    created.setAttribute(attribute, key);
    created.setAttribute('content', content);
    document.head.appendChild(created);
    return () => created.remove();
}

function upsertCanonical(href: string): Restore {
    const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (existing) {
        const previous = existing.getAttribute('href');
        existing.setAttribute('href', href);
        return () => { if (previous !== null) existing.setAttribute('href', previous); };
    }
    const created = document.createElement('link');
    created.setAttribute('rel', 'canonical');
    created.setAttribute('href', href);
    document.head.appendChild(created);
    return () => created.remove();
}

// Sets the document's title, description, Open Graph and canonical tags for the mounted page, and undoes
// them on unmount. The app is a single-page app: crawlers and link previews that do not run JavaScript
// still see only index.html's tags, so this improves tabs, shares and search results rather than previews.
export function usePageMeta(meta: PageMeta): void {
    const { title, description, image, path, type = 'website', price, noindex = false } = meta;
    const priceAmount = price?.amount ?? null;
    const priceCurrency = price?.currency ?? null;

    useEffect(() => {
        const restores: Restore[] = [];
        const previousTitle = document.title;
        document.title = title;
        restores.push(() => { document.title = previousTitle; });

        const url = `${window.location.origin}${path ?? window.location.pathname}`;
        restores.push(upsertCanonical(url));
        restores.push(upsertMeta('property', 'og:title', title));
        restores.push(upsertMeta('property', 'og:type', type));
        restores.push(upsertMeta('property', 'og:url', url));
        restores.push(upsertMeta('property', 'og:locale', 'ar_SD'));
        restores.push(upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'));
        if (description) {
            restores.push(upsertMeta('name', 'description', description));
            restores.push(upsertMeta('property', 'og:description', description));
        }
        if (image) restores.push(upsertMeta('property', 'og:image', image));
        if (priceAmount !== null && priceCurrency !== null) {
            restores.push(upsertMeta('property', 'product:price:amount', String(priceAmount)));
            restores.push(upsertMeta('property', 'product:price:currency', priceCurrency));
        }
        if (noindex) restores.push(upsertMeta('name', 'robots', 'noindex'));

        return () => {
            for (const restore of restores.reverse()) restore();
        };
    }, [title, description, image, path, type, priceAmount, priceCurrency, noindex]);
}
