import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Trash2 } from 'lucide-react';
import { DeleteAccountCard } from '../../components/account/DeleteAccountCard';

export const DeleteProfilePage: React.FC = () => {
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
                <div className="flex items-center gap-2">
                    <Trash2 className="w-6 h-6 text-red-500" />
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">حذف الحساب</h1>
                </div>
            </div>

            <DeleteAccountCard />
        </div>
    );
};
