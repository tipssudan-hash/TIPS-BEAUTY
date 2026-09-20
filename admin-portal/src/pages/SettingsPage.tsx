import React, { useEffect, useState } from 'react';
import { Settings, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { fetchNotificationEmails, saveNotificationEmails, errorMessage } from '../lib/catalogApi';
import { Card, Notice, PageHeader, Spinner, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const SettingsPage: React.FC = () => {
    const [emails, setEmails] = useState<string[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        fetchNotificationEmails()
            .then(setEmails)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل الإعدادات.')))
            .finally(() => setLoading(false));
    }, []);

    const add = () => {
        const value = draft.trim().toLowerCase();
        if (!isEmail(value)) { setError('أدخلي بريداً إلكترونياً صحيحاً.'); return; }
        if (emails.includes(value)) { setError('هذا البريد موجود مسبقاً.'); return; }
        setError(null);
        setEmails([...emails, value]);
        setDraft('');
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await saveNotificationEmails(emails);
            setSuccess('تم حفظ الإعدادات.');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8 max-w-3xl">
            <PageHeader title="الإعدادات" subtitle="إعدادات عامة للمتجر ولوحة الإدارة." icon={<Settings className="w-8 h-8 text-brand-blue" />} />

            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            <Card className="p-8 space-y-6">
                <div>
                    <h3 className="text-lg font-black text-slate-900">بريد تنبيهات الطلبات الجديدة</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">يصل تنبيه بكل طلب جديد إلى هذه العناوين. اتركي القائمة فارغة لإيقاف التنبيهات.</p>
                </div>

                <div className="flex gap-2">
                    <input
                        type="email"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                        placeholder="name@tips-sd.com"
                        className={`${inputClass} flex-1`}
                        dir="ltr"
                    />
                    <button type="button" onClick={add} className={`${secondaryButtonClass} flex items-center gap-1`}><Plus className="w-4 h-4" /> إضافة</button>
                </div>

                <ul className="divide-y divide-slate-50 border border-slate-100 rounded-2xl">
                    {emails.length === 0 && <li className="p-4 text-sm text-slate-400 font-bold text-center">لا توجد عناوين بعد.</li>}
                    {emails.map((email) => (
                        <li key={email} className="flex items-center justify-between p-4">
                            <span className="font-bold text-slate-800" dir="ltr">{email}</span>
                            <button type="button" onClick={() => setEmails(emails.filter((e) => e !== email))} className="p-2 text-red-500 hover:bg-red-50 rounded-xl" aria-label={`حذف ${email}`}><Trash2 className="w-4 h-4" /></button>
                        </li>
                    ))}
                </ul>

                <div className="flex justify-end">
                    <button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} حفظ
                    </button>
                </div>
            </Card>
        </div>
    );
};
