import React, { useCallback, useEffect, useState } from 'react';
import { Settings, Plus, Trash2, Save, Loader2, RefreshCw } from 'lucide-react';
import { fetchDeliveryPolicySettings, saveDeliveryPolicySettings } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { Card, Notice, PageHeader, Spinner, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

interface SettingToggleProps {
    label: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (value: boolean) => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({ label, description, checked, disabled, onChange }) => {
    const labelId = React.useId();
    return (
        <div className="flex items-start justify-between gap-4 p-4 border border-slate-100 rounded-2xl">
            <div>
                <p id={labelId} className="font-black text-slate-800">{label}</p>
                <p className="text-sm text-slate-500 font-medium mt-1">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={labelId}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'right-1' : 'right-6'}`} />
            </button>
        </div>
    );
};

export const SettingsPage: React.FC = () => {
    const [emails, setEmails] = useState<string[]>([]);
    const [requirePackingCheck, setRequirePackingCheck] = useState(false);
    const [requireDeliveryProof, setRequireDeliveryProof] = useState(false);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const settings = await fetchDeliveryPolicySettings();
            setEmails(settings.notification_emails);
            setRequirePackingCheck(settings.require_packing_check);
            setRequireDeliveryProof(settings.require_delivery_proof);
            setLoaded(true);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الإعدادات.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const add = () => {
        const value = draft.trim().toLowerCase();
        if (!isEmail(value)) { setError('أدخلي بريداً إلكترونياً صحيحاً.'); return; }
        if (emails.includes(value)) { setError('هذا البريد موجود مسبقاً.'); return; }
        setError(null);
        setEmails([...emails, value]);
        setDraft('');
    };

    const save = async () => {
        if (!loaded || saving) return;
        if (emails.length === 0 && !window.confirm('القائمة فارغة، وسيتوقف إرسال تنبيهات الطلبات الجديدة. هل تريد حفظ القائمة الفارغة؟')) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await saveDeliveryPolicySettings({
                notification_emails: emails,
                require_packing_check: requirePackingCheck,
                require_delivery_proof: requireDeliveryProof,
            });
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

            {!loaded ? (
                <Card className="p-8 text-center space-y-4">
                    <p className="text-sm font-bold text-slate-500">لم تُحمَّل الإعدادات بعد، لذلك لا يمكن تعديلها أو حفظها.</p>
                    <button type="button" onClick={() => void load()} className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
                        <RefreshCw className="w-4 h-4" /> إعادة المحاولة
                    </button>
                </Card>
            ) : (
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

                    <div className="space-y-4 pt-6 border-t border-slate-100">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">شروط التجهيز والتسليم</h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">تُفرض هذه الشروط على المستودعات والمناديب بعد حفظها.</p>
                        </div>
                        <SettingToggle
                            label="فحص التجهيز قبل الشحن"
                            description="لا يُنقل الطلب إلى «في الطريق» قبل تعليمه «تم التجهيز» بعد فحص كل بنوده بكمياتها كاملة."
                            checked={requirePackingCheck}
                            disabled={saving}
                            onChange={setRequirePackingCheck}
                        />
                        <SettingToggle
                            label="صورة إثبات التسليم"
                            description="لا يُسجَّل التسليم للعميل دون صورة إثبات يرفعها المندوب."
                            checked={requireDeliveryProof}
                            disabled={saving}
                            onChange={setRequireDeliveryProof}
                        />
                    </div>

                    <div className="flex justify-end">
                        <button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} حفظ
                        </button>
                    </div>
                </Card>
            )}
        </div>
    );
};
