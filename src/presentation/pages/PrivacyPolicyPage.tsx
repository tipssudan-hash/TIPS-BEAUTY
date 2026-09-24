import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

// Public, unauthenticated, and linked from the app: both stores require a reachable privacy policy URL
// (https://beauty.tips-sd.com/privacy) before they will accept a submission.
//
// This describes what the system actually does today — the data it holds, where it goes, how deletion
// works — so it is accurate rather than boilerplate. It is NOT legal advice and has not been reviewed
// by a lawyer; the owner is arranging that review before launch.

const UPDATED = '٢٤ سبتمبر ٢٠٢٦';

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
);

export const PrivacyPolicyPage: FC = () => (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-1">سياسة الخصوصية</h1>
        <p className="text-sm text-gray-400 mb-8">آخر تحديث: {UPDATED}</p>

        <Card className="p-6 space-y-6">
            <Section title="من نحن">
                <p>
                    تيبس بيوتي متجر إلكتروني لمنتجات التجميل في السودان، تابع لشركة TIPS INTEGRATED SOLUTIONS.
                    توضح هذه السياسة البيانات التي نجمعها وكيف نستخدمها.
                </p>
            </Section>

            <Section title="البيانات التي نجمعها">
                <ul className="list-disc ps-5 space-y-1">
                    <li><strong>بيانات الحساب:</strong> الاسم، البريد الإلكتروني أو رقم الهاتف، وكلمة المرور (مشفّرة، ولا نراها).</li>
                    <li><strong>بيانات الطلب:</strong> المنتجات، المبالغ، عنوان التوصيل، الولاية والمحلية، ورقم الهاتف للتواصل عند التوصيل.</li>
                    <li><strong>إثبات الدفع:</strong> عند الدفع عبر مايكاشي نحفظ الرقم المرجعي وإثبات الدفع للتحقق من التحويل.</li>
                    <li><strong>التقييمات:</strong> تقييمك وتعليقك على المنتجات التي استلمتها.</li>
                    <li><strong>بيانات الجهاز:</strong> رمز الإشعارات إذا وافقتِ على استقبال إشعارات حالة الطلب.</li>
                </ul>
                <p>لا نجمع بيانات بطاقات بنكية، ولا توجد بوابة دفع إلكترونية في التطبيق.</p>
            </Section>

            <Section title="عند تسجيل الدخول عبر Google أو Apple">
                <p>
                    نستلم من المزوّد اسمك وبريدك الإلكتروني فقط، لإنشاء حسابك. إذا اخترتِ «إخفاء بريدي الإلكتروني»
                    من Apple فسنستلم عنواناً وسيطاً من Apple ولن نرى بريدك الحقيقي. لا يمكن لهذه المزوّدات
                    الوصول إلى طلباتك أو بياناتك داخل التطبيق.
                </p>
            </Section>

            <Section title="لماذا نستخدم هذه البيانات">
                <ul className="list-disc ps-5 space-y-1">
                    <li>تنفيذ طلبك وتوصيله والتحقق من الدفع.</li>
                    <li>إرسال إشعارات ورسائل حالة الطلب.</li>
                    <li>خدمة العملاء ومعالجة الشكاوى والإرجاع.</li>
                    <li>الاحتفاظ بالسجلات المالية كما يقتضيه العمل التجاري.</li>
                </ul>
                <p>لا نبيع بياناتك، ولا نستخدمها في إعلانات لأطراف أخرى.</p>
            </Section>

            <Section title="مع من نشاركها">
                <p>
                    نشاركها فقط بالقدر اللازم لتنفيذ الخدمة: مندوب التوصيل يرى اسمك وعنوانك ورقم هاتفك لطلبك،
                    ومزوّد البريد الإلكتروني يرسل رسائل الطلب، ومزوّد قاعدة البيانات يستضيف البيانات.
                    موظفو تيبس بيوتي يرون الطلبات لتنفيذها.
                </p>
            </Section>

            <Section title="مدة الاحتفاظ">
                <p>
                    نحتفظ ببيانات حسابك طالما كان الحساب قائماً، وبسجلات الطلبات كسجلات مالية بعد ذلك —
                    لكن دون بياناتك الشخصية إذا حذفتِ حسابك.
                </p>
            </Section>

            <Section title="حذف حسابك">
                <p>
                    يمكنك حذف حسابك من داخل التطبيق: <Link to="/settings" className="text-brand-blue font-bold underline">حسابي ← حذف الحساب</Link>.
                    عند الحذف نحذف اسمك ورقم هاتفك وبريدك الإلكتروني وعناوينك وصور إثبات الدفع، ونوقف الإشعارات،
                    ولن يعود بإمكانك تسجيل الدخول. تبقى سجلات الطلبات بأرقامها ومبالغها فقط، بدون ما يعرّفك،
                    لأن السجلات المالية مطلوبة. الحذف نهائي ولا يمكن التراجع عنه.
                </p>
            </Section>

            <Section title="حقوقك">
                <p>
                    يمكنك الاطلاع على بياناتك وتصحيحها من صفحة حسابي، أو حذف حسابك بالكامل. لأي طلب آخر
                    يخص بياناتك تواصلي معنا.
                </p>
            </Section>

            <Section title="التواصل">
                <p>
                    لأي سؤال عن الخصوصية: <a href="mailto:privacy@tips-sd.com" className="text-brand-blue font-bold underline">privacy@tips-sd.com</a>
                </p>
            </Section>
        </Card>
    </div>
);
