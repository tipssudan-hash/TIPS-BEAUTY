import React from 'react';
import { Flame, Gift, Heart, Leaf, Sparkles, Star, Tag, type LucideIcon } from 'lucide-react';

// Collection icons are stored by name (storefront_collections.icon); the Admin Portal offers the
// same names (admin-portal/src/lib/catalogApi.ts COLLECTION_ICONS). Unknown names render nothing.
const ICONS: Record<string, LucideIcon> = {
    'auto-awesome': Sparkles,
    star: Star,
    tag: Tag,
    gift: Gift,
    flame: Flame,
    heart: Heart,
    leaf: Leaf,
};

export function collectionIcon(name: string): React.ReactNode {
    const Icon = ICONS[name];
    return Icon ? <Icon className="w-5 h-5 text-brand-blue" aria-hidden="true" /> : null;
}
