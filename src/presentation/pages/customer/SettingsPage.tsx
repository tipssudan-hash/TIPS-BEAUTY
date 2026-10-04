import React from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Package, ChevronLeft, Percent, ShieldCheck, Trash2, Edit } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui';

export const SettingsPage: React.FC = () => {
    const { user, signOut } = useAuth();

    const fullName = (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || 'مستخدم تيبس';
    const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) || (user?.user_metadata?.picture as string | undefined) || null;
    const initials = (fullName || user?.email || 'T').trim()[0]?.toUpperCase() || 'T';

    const menuItems = [
        { to: '/profile', label: 'الملف الشخصي', icon: User, desc: 'تعديل الاسم ورقم الهاتف والصورة الشخصية' },
        { to: '/orders', label: 'طلباتي', icon: Package, desc: 'متابعة الطلبات السابقة والحالية' },
        { to: '/offers', label: 'العروض والكوبونات', icon: Percent, desc: 'أحدث التخفيضات والخصومات' },
        { to: '/privacy', label: 'سياسة الخصوصية', icon: ShieldCheck, desc: 'الشروط وحماية البيانات' },
        { to: '/delete-profile', label: 'حذف الحساب', icon: Trash2, desc: 'إلغاء تنشيط وحذف بيانات حسابك', danger: true },
    ];

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
                {/* User Header Card */}
                <Card className="p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue-soft rounded-full -mr-16 -mt-16 opacity-50"></div>
                    <div className="relative flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand-blue-soft shadow-sm bg-gradient-to-tr from-brand-blue/10 to-brand-blue/20 flex items-center justify-center">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={fullName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-bold text-brand-blue">{initials}</span>
                                )}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">{fullName}</h2>
                                <p className="text-gray-500 text-sm">{user?.email}</p>
                            </div>
                        </div>

                        <Link
                            to="/profile"
                            className="flex items-center gap-1.5 text-xs font-bold text-brand-blue bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-colors"
                        >
                            <Edit className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                        </Link>
                    </div>
                </Card>

                {/* Settings Navigation List */}
                <div className="space-y-3">
                    {menuItems.map(({ to, label, icon: Icon, desc, danger }) => (
                        <Link
                            key={to}
                            to={to}
                            className={`flex items-center justify-between bg-white rounded-card p-4 sm:p-5 shadow-card border transition-all hover:shadow-md ${
                                danger
                                    ? 'border-red-100 hover:border-red-300 text-red-600'
                                    : 'border-brand-blue-soft hover:border-brand-blue text-gray-800'
                            }`}
                        >
                            <div className="flex items-center gap-3.5">
                                <div className={`p-2.5 rounded-xl ${danger ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-brand-blue'}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="font-bold block text-sm sm:text-base">{label}</span>
                                    {desc && <span className="text-xs text-gray-400 block mt-0.5">{desc}</span>}
                                </div>
                            </div>
                            <ChevronLeft className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-gray-400'}`} />
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};
