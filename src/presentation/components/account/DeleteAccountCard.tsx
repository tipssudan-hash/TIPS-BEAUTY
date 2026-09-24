import { useEffect, useState, type FC } from 'react';
import { Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@infrastructure/supabase';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '@application/errors';
import { Card, Notice, secondaryButtonClass } from '../ui';

// Apple Guideline 5.1.1(v): an app that creates accounts must let customers delete them in the app.
// A form that emails staff is rejected, so this has to complete here.
//
// The confirmation is deliberately heavy — typed word, stated consequences, counts read from the
// server — because the action cannot be undone and it happens one tap from "my orders".

const CONFIRM_WORD = 'حذف';

type Preview = { orders: number; active_orders: number; reviews: number; beauty_points: number };

export const DeleteAccountCard: FC = () => {
    const { signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [confirmation, setConfirmation] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || preview) return;
        void (async () => {
            const { data, error: previewError } = await supabase.rpc('account_deletion_preview');
            if (previewError) {
                setError(errorMessage(previewError));
                return;
            }
            setPreview(data as unknown as Preview);
        })();
    }, [open, preview]);

    const remove = async () => {
        setPending(true);
        setError(null);
        try {
            const { error: deleteError } = await supabase.rpc('delete_my_account');
            if (deleteError) throw deleteError;
            // The account is already banned server-side; clearing the local session avoids leaving the
            // app holding a token that no longer works.
            await signOut();
        } catch (err) {
            setError(errorMessage(err));
            setPending(false);
        }
    };

    const blocked = (preview?.active_orders ?? 0) > 0;

    if (!open) {
        return (
            <Card className="p-6">
                <h2 className="font-bold text-gray-800 mb-1">حذف الحساب</h2>
                <p className="text-sm text-gray-500 mb-4">
                    يمكنك حذف حسابك وبياناتك الشخصية نهائياً من التطبيق.
                </p>
                <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
                    <Trash2 className="w-4 h-4" />
                    حذف حسابي
                </button>
            </Card>
        );
    }

    return (
        <Card className="p-6 border-red-200">
            <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" aria-hidden="true" />
                تأكيد حذف الحساب
            </h2>

            {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

            {blocked ? (
                <Notice kind="error">
                    لديك {preview?.active_orders} طلب قيد التنفيذ. يمكنك حذف الحساب بعد استلام الطلب أو إلغائه.
                </Notice>
            ) : (
                <>
                    <ul className="text-sm text-gray-600 space-y-2 mb-4 list-disc ps-5">
                        <li>سيتم حذف اسمك ورقم هاتفك وبريدك الإلكتروني وعنوانك.</li>
                        <li>سيتم حذف صور إثبات الدفع الخاصة بك.</li>
                        {preview && preview.orders > 0 && (
                            <li>سيتم الاحتفاظ بسجل {preview.orders} طلب بدون بياناتك الشخصية، لأن السجلات المالية مطلوبة.</li>
                        )}
                        {preview && preview.reviews > 0 && (
                            <li>ستبقى تقييماتك ({preview.reviews}) منشورة بدون اسمك.</li>
                        )}
                        {preview && preview.beauty_points > 0 && (
                            <li>ستفقدين {preview.beauty_points} نقطة جمال نهائياً.</li>
                        )}
                        <li>لا يمكن استعادة الحساب بعد الحذف.</li>
                    </ul>

                    <label className="block space-y-2 mb-4">
                        <span className="text-sm font-bold text-gray-700">
                            للتأكيد، اكتبي كلمة «{CONFIRM_WORD}»
                        </span>
                        <input
                            type="text"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-control p-3 outline-none focus:ring-2 focus:ring-red-400"
                            autoComplete="off"
                        />
                    </label>
                </>
            )}

            <div className="flex flex-wrap gap-3">
                {!blocked && (
                    <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={pending || confirmation.trim() !== CONFIRM_WORD || preview === null}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-control flex items-center justify-center gap-2 transition-all"
                    >
                        {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        حذف الحساب نهائياً
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => { setOpen(false); setConfirmation(''); setError(null); }}
                    disabled={pending}
                    className={secondaryButtonClass}
                >
                    إلغاء
                </button>
            </div>
        </Card>
    );
};
