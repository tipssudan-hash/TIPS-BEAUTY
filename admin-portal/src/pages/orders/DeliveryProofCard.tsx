import React, { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { signedDeliveryProofUrl } from '../../lib/adminApi';
import { Card } from '../../components/ui';

interface DeliveryProofCardProps {
    path: string;
}

export const DeliveryProofCard: React.FC<DeliveryProofCardProps> = ({ path }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        signedDeliveryProofUrl(path)
            .then((signed) => { if (active) { setUrl(signed); setFailed(signed === null); } })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [path]);

    return (
        <Card className="p-6 text-sm">
            <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Camera className="w-5 h-5 text-brand-blue" /> إثبات التسليم</h2>
            {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="block">
                    <img src={url} alt="صورة إثبات التسليم" className="w-full max-h-72 object-contain rounded-xl border border-slate-100 bg-slate-50" />
                </a>
            ) : failed ? (
                <p className="text-xs text-slate-400">تعذر عرض صورة الإثبات.</p>
            ) : (
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
            )}
        </Card>
    );
};
