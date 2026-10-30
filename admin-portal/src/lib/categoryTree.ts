import type { Category } from '../types';

// Two levels: top-level groups (parent_id null) and their leaves. Input order (sort_order) is kept.
export function topLevelCategories(categories: Category[]): Category[] {
    return categories.filter((c) => !c.parent_id);
}

export function childrenByParent(categories: Category[]): Map<string, Category[]> {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
        if (c.parent_id) map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c]);
    }
    return map;
}

// A group selected in a filter covers its own products and its children's.
export function categoryAndChildIds(categories: Category[], id: string): Set<string> {
    const ids = new Set([id]);
    for (const c of categories) if (c.parent_id === id) ids.add(c.id);
    return ids;
}

export function categoryLabel(category: Category): string {
    return category.is_active ? category.name_ar : `${category.name_ar} (مخفية)`;
}

export function categoryPathLabel(category: Category, categories: Category[]): string {
    const parent = category.parent_id ? categories.find((c) => c.id === category.parent_id) : undefined;
    return parent ? `${parent.name_ar} › ${categoryLabel(category)}` : categoryLabel(category);
}
