import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { setOrderEta, type AdminOrder } from '../../lib/adminApi';
import { formatDateTime, fromLocalInput, toLocalInput } from '../../lib/format';
import { Card } from '../../components/ui';

interface DeliveryScheduleCardProps {
    order: AdminOrder;
    busy: boolean;
    run: (action: () => Promise<void>) => Promise<void>;
}

export const DeliveryScheduleCard: React.FC<DeliveryScheduleCardProps> = ({ order, busy, run }) => {
    const [eta, setEta] = useState(toLocalInput(order.estimated_delivery_at));
    const [note, setNote] = useState('');
    const editable = order.status !== 'delivered' && order.status !== 'cancelled';
    const unchanged = eta === toLocalInput(order.estimated_delivery_at) && !note.trim();
    const etaMissing = eta === '';

    const save = () => run(async () => {
        await setOrderEta(order.id, fromLocalInput(eta), note);
        setNote('');
    });

    return (
        <Card className="p-6 text-sm">
            <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-brand-blue" /> الموعد المتوقع</h2>
            <p className="text-xs font-bold text-slate-500 mb-3">
                {order.estimated_delivery_at ? `الموعد الحالي: ${formatDateTime(order.estimated_delivery_at)}` : 'لم يُحدَّد موعد بعد.'}
            </p>
            <label className="block mb-3">
                <span className="text-xs font-bold text-slate-500 mb-1 block">الموعد المتوقع للتوصيل</span>
                <input
                    type="datetime-local"
                    value={eta}
                    disabled={!editable || busy}
                    onChange={(e) => setEta(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-60"
                />
            </label>
            <label className="block mb-4">
                <span className="text-xs font-bold text-slate-500 mb-1 block">ملاحظة الموعد (تُسجل في سجل الطلب)</span>
                <textarea
                    value={note}
                    disabled={!editable || busy}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-60"
                />
            </label>
            <button
                type="button"
                disabled={!editable || busy || unchanged || etaMissing}
                onClick={() => void save()}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 disabled:opacity-50"
            >
                حفظ الموعد
            </button>
            {!editable && <p className="text-[11px] text-slate-400 mt-2">لا يمكن تعديل الموعد بعد اكتمال الطلب أو إلغائه.</p>}
            {editable && etaMissing && <p className="text-[11px] text-slate-400 mt-2">الموعد المتوقع مطلوب لحفظ التعديل.</p>}
        </Card>
    );
};
