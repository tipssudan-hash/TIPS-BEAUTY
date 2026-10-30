import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageCount } from '../lib/pagination';
import { cn } from '../lib/cn';
import { secondaryButtonClass } from './ui';

export const Pagination: React.FC<{ page: number; pageSize: number; total: number; onPageChange: (page: number) => void; loading?: boolean }> = ({ page, pageSize, total, onPageChange, loading }) => {
    const pages = pageCount(total, pageSize);
    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min(total, (page + 1) * pageSize);
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-500">
            <span>{total === 0 ? 'لا توجد نتائج' : `عرض ${from}–${to} من ${total}`}</span>
            <div className="flex items-center gap-2">
                <button type="button" className={cn(secondaryButtonClass, 'px-3 py-2')} disabled={loading || page <= 0} onClick={() => onPageChange(page - 1)} aria-label="الصفحة السابقة">
                    <ChevronRight size={16} />
                </button>
                <span className="min-w-24 text-center text-slate-700">صفحة {page + 1} من {pages}</span>
                <button type="button" className={cn(secondaryButtonClass, 'px-3 py-2')} disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)} aria-label="الصفحة التالية">
                    <ChevronLeft size={16} />
                </button>
            </div>
        </div>
    );
};
