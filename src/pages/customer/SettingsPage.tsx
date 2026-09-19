import React from 'react';
import { Link } from 'react-router-dom';
import { User as UserIcon, LogOut, Package, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SettingsPage: React.FC = () => {
    const { user, signOut } = useAuth();

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">حسابي</h1>
                <button
                    onClick={() => void signOut()}
                    className="flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors font-bold text-sm"
                >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج
                </button>
            </div>

            <div className="space-y-6">
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-brand-blue-soft overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue-soft rounded-full -mr-16 -mt-16 opacity-50"></div>
                    <div className="relative flex items-center gap-4">
                        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-brand-blue">
                            <UserIcon className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                {(user?.user_metadata?.full_name as string | undefined) || 'مرحباً بك'}
                            </h2>
                            <p className="text-gray-500 text-sm">{user?.email}</p>
                        </div>
                    </div>
                </section>

                <Link to="/orders" className="flex items-center justify-between bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-brand-blue-soft transition-colors">
                    <span className="flex items-center gap-3 font-bold text-gray-800">
                        <Package className="w-6 h-6 text-brand-blue" />
                        طلباتي
                    </span>
                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                </Link>
            </div>
        </div>
    );
};
