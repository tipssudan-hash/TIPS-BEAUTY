import React, { useState, useEffect, useRef } from 'react';
import { Camera, Check, Loader2, Save, User as UserIcon, Mail, Phone, ShieldCheck } from 'lucide-react';
import { Card, Notice, primaryButtonClass } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { fetchUserProfile, updateUserProfile, uploadUserAvatar, type UserProfile } from '@infrastructure/auth/profileService';

export const ProfileEditorCard: React.FC = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        fetchUserProfile(user.id)
            .then((data) => {
                if (cancelled || !data) return;
                setProfile(data);
                setFullName(data.fullName || '');
                setPhone(data.phone || '');
                setAvatarUrl(data.avatarUrl);
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user]);

    const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        if (file.size > 5 * 1024 * 1024) {
            setErrorMessage('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
            return;
        }

        setUploadingAvatar(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const url = await uploadUserAvatar(user.id, file);
            setAvatarUrl(url);
            setSuccessMessage('تم تحديث الصورة الشخصية بنجاح');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
            setErrorMessage('تعذر رفع الصورة، يرجى المحاولة مرة أخرى');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setSaving(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            await updateUserProfile(user.id, {
                fullName: fullName.trim(),
                phone: phone.trim() || undefined,
            });
            setSuccessMessage('تم حفظ التغييرات بنجاح');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'تعذر حفظ البيانات');
        } finally {
            setSaving(false);
        }
    };

    const initials = (fullName || user?.email || 'T').trim()[0]?.toUpperCase() || 'T';

    if (loading) {
        return (
            <Card className="p-6 flex items-center justify-center min-h-[160px]">
                <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </Card>
        );
    }

    const providerName = profile?.signupMethod === 'google' ? 'Google' : profile?.signupMethod === 'apple' ? 'Apple' : 'البريد الإلكتروني';

    return (
        <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-xl font-bold text-gray-800">الملف الشخصي</h2>
                <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-brand-blue rounded-full border border-blue-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    تسجيل الدخول عبر {providerName}
                </span>
            </div>

            {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-xl flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span>{successMessage}</span>
                </div>
            )}

            {errorMessage && <Notice kind="error">{errorMessage}</Notice>}

            {/* Avatar Section */}
            <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-brand-blue-soft shadow-sm bg-gradient-to-tr from-brand-blue/10 to-brand-blue/20 flex items-center justify-center">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={fullName || 'Avatar'}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-3xl font-bold text-brand-blue">{initials}</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        aria-label="تغيير الصورة الشخصية"
                        className="absolute bottom-0 left-0 bg-brand-blue text-white p-2 rounded-full shadow-md hover:bg-brand-blue/90 transition-transform active:scale-95 disabled:opacity-50"
                    >
                        {uploadingAvatar ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Camera className="w-4 h-4" />
                        )}
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarSelect}
                    />
                </div>

                <div className="text-center sm:text-right space-y-1">
                    <h3 className="font-bold text-gray-800 text-lg">{fullName || 'مستخدم تيبس'}</h3>
                    <p className="text-sm text-gray-500">{user?.email}</p>
                    <p className="text-xs text-gray-400">انقر على أيقونة الكاميرا لتغيير صورتك الشخصية</p>
                </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
                <div>
                    <label htmlFor="profile-fullName" className="block text-sm font-bold text-gray-700 mb-1">
                        الاسم بالكامل
                    </label>
                    <div className="relative">
                        <UserIcon className="w-5 h-5 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            id="profile-fullName"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="أدخل اسمك الكامل"
                            className="w-full pr-11 pl-4 py-3 bg-gray-50/50 border border-gray-200 rounded-control focus:bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="profile-email" className="block text-sm font-bold text-gray-700 mb-1">
                        البريد الإلكتروني
                    </label>
                    <div className="relative">
                        <Mail className="w-5 h-5 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            id="profile-email"
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full pr-11 pl-4 py-3 bg-gray-100 border border-gray-200 rounded-control text-gray-500 cursor-not-allowed text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="profile-phone" className="block text-sm font-bold text-gray-700 mb-1">
                        رقم الهاتف
                    </label>
                    <div className="relative">
                        <Phone className="w-5 h-5 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            id="profile-phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="0912345678"
                            className="w-full pr-11 pl-4 py-3 bg-gray-50/50 border border-gray-200 rounded-control focus:bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all text-sm"
                            dir="ltr"
                        />
                    </div>
                </div>

                <div className="pt-2 flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className={`${primaryButtonClass} flex items-center justify-center gap-2 px-6`}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>حفظ التعديلات</span>
                    </button>
                </div>
            </form>
        </Card>
    );
};
