import { supabase } from '../supabase/client';

export async function askBeautyAdvice(query: string, skinType?: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('beauty-advice', { body: { query, skin_type: skinType } });
    if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? 'تعذر الحصول على رد من المساعد حالياً.');
    }
    if (data?.error) throw new Error(data.error);
    return data?.answer ?? '';
}
