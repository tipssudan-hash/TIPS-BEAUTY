import React from 'react';
import type { Category } from '@domain/entities';
import { ALL_CATEGORIES, categoryScopeIds, childCategories, storefrontCategories } from '@application/services/productSearch';
import { imgUrl } from '@infrastructure/repositories';

interface CategoryChipsProps {
    categories: Category[];
    activeId: string | null;
    onSelect: (id: string | null) => void;
    showImages?: boolean;
}

const chipClass = (active: boolean) =>
    `inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${active ? 'bg-brand-blue text-white shadow-sm' : 'bg-white border border-brand-blue-soft text-gray-600 hover:border-brand-blue'}`;

export const CategoryChips: React.FC<CategoryChipsProps> = ({ categories, activeId, onSelect, showImages = false }) => {
    const topLevel = storefrontCategories(categories);
    const activeTop = topLevel.find((c) => activeId !== null && categoryScopeIds(categories, c.id).has(activeId)) ?? null;
    const children = activeTop ? childCategories(categories, activeTop.id) : [];

    return (
        <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <button type="button" onClick={() => onSelect(null)} className={chipClass(activeId === null)}>{ALL_CATEGORIES}</button>
                {topLevel.map((c) => (
                    <button type="button" key={c.id} onClick={() => onSelect(c.id)} className={chipClass(activeTop?.id === c.id)}>
                        {showImages && c.imageUrl ? <img src={imgUrl(c.imageUrl, 64)} alt="" loading="lazy" className="h-6 w-6 sm:h-7 sm:w-7 rounded-full object-cover" /> : null}
                        {c.name_ar}
                    </button>
                ))}
            </div>
            {children.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    {children.map((c) => (
                        <button type="button" key={c.id} onClick={() => onSelect(c.id)} className={chipClass(activeId === c.id)}>{c.name_ar}</button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};
