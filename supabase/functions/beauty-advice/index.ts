import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await service.auth.getUser(authorization.slice(7));
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  try {
    const input = await request.json() as { query?: string; skin_type?: string };
    const query = input.query?.trim();
    if (!query || query.length > 600) return json({ error: "الرسالة يجب أن تكون بين حرف واحد و600 حرف." }, 400);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await service.from("ai_request_limits").select("id", { count: "exact", head: true }).eq("customer_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= 12) return json({ error: "تم الوصول للحد المؤقت للمساعد. حاولي بعد ساعة." }, 429);
    await service.from("ai_request_limits").insert({ customer_id: user.id });

    const { data: catalog } = await service.from("products").select("name_ar,brand,price,category,stock").gt("stock", 0).order("created_at", { ascending: false }).limit(80);
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "خدمة المساعد لم تُهيأ بعد." }, 503);

    const prompt = `أنت مساعد جمال لمتجر تيبس بيوتي في السودان. أجب بالعربية السودانية بلطف وباختصار. لا تقدم تشخيصاً طبياً ولا وعوداً علاجية. إذا كان السؤال عن حساسية شديدة أو حالة جلدية مستمرة، انصح باستشارة مختص. استخدم فقط المنتجات التالية عند الاقتراح، واذكر السعر بالجنيه السوداني عند المناسب. نوع البشرة الذي ذكره العميل: ${input.skin_type || 'غير محدد'}\n\nالكتالوج:\n${(catalog || []).map((p) => `${p.name_ar} | ${p.brand || ''} | ${p.category || ''} | ${p.price} ج.س`).join("\n")}\n\nسؤال العميل: ${query}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 450 } }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Gemini unavailable");
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) throw new Error("Empty assistant response");
    return json({ answer });
  } catch (error) {
    console.error("beauty-advice", error);
    return json({ error: "تعذر الحصول على رد من المساعد حالياً." }, 500);
  }
});
