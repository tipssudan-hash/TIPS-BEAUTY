import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card, primaryButtonClass, secondaryButtonClass } from '../../components/ui';

const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_PORTAL_URL as string | undefined;

// Warehouse managers work in the Admin Portal; this surface only points them there.
export const SupervisorNoticePage: React.FC = () => {
    const { signOut } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50/60 flex items-center justify-center p-4 font-sans text-gray-900" dir="rtl">
            <Card className="w-full max-w-md p-6 sm:p-8 text-center space-y-4">
                <img src="/logo.PNG" alt="Tips Beauty" className="h-12 w-auto object-contain mx-auto select-none" />
                <h1 className="text-xl font-bold text-gray-900">تم نقل إدارة المستودع إلى بوابة الإدارة</h1>
                <p className="text-sm text-gray-600 leading-relaxed">
                    الطلبات والمشتريات والمخزون والتسليمات تُدار من بوابة الإدارة. هذه الصفحة لا تعرض بيانات المستودع.
                </p>
                {ADMIN_PORTAL_URL ? (
                    <a href={ADMIN_PORTAL_URL} className={`${primaryButtonClass} w-full`}>
                        الانتقال إلى بوابة الإدارة
                    </a>
                ) : (
                    <p className="text-sm font-bold text-gray-700">افتحي بوابة الإدارة من الرابط الذي أرسله لكِ فريق التشغيل.</p>
                )}
                <button type="button" onClick={() => void signOut()} className={`${secondaryButtonClass} w-full flex items-center justify-center gap-2`}>
                    <LogOut className="w-4 h-4" /> تسجيل الخروج
                </button>
            </Card>
        </div>
    );
};
