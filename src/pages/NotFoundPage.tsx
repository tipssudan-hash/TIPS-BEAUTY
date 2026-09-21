import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState, primaryButtonClass } from '../components/ui';

export const NotFoundPage: React.FC = () => (
    <div className="max-w-xl mx-auto p-4 md:p-8">
        <EmptyState
            icon={<Compass className="w-7 h-7" />}
            title="الصفحة غير موجودة"
            body="ربما تغيّر الرابط أو لم يعد متاحاً."
            action={<Link to="/" className={primaryButtonClass}>العودة للرئيسية</Link>}
        />
    </div>
);
