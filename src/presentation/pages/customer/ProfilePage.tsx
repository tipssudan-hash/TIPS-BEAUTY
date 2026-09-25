import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ProfileEditorCard } from '../../components/account/ProfileEditorCard';

export const ProfilePage: React.FC = () => {
    return (
        <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <Link
                    to="/settings"
                    className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-brand-blue hover:border-brand-blue transition-colors"
                    aria-label="العودة للإعدادات"
                >
                    <ArrowRight className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">الملف الشخصي</h1>
            </div>

            <ProfileEditorCard />
        </div>
    );
};
