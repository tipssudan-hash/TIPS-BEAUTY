import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Sparkles, Heart, Phone, Mail, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-white border-t border-brand-blue-soft mt-12 pb-16 md:pb-0 text-gray-700">
            {/* Value Proposition Highlights */}
            <div className="border-b border-gray-100 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-right">
                        <div className="flex items-center justify-center sm:justify-start gap-3.5">
                            <div className="p-3 bg-brand-blue-soft text-brand-blue rounded-2xl">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">منتجات أصلية 100%</h4>
                                <p className="text-xs text-gray-500 mt-0.5">من أفضل الماركات المحلية والعالمية</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-3.5">
                            <div className="p-3 bg-brand-blue-soft text-brand-blue rounded-2xl">
                                <Truck className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">توصيل سريع وموثوق</h4>
                                <p className="text-xs text-gray-500 mt-0.5">توصيل مباشر إلى باب منزلك في السودان</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-3.5">
                            <div className="p-3 bg-brand-blue-soft text-brand-blue rounded-2xl">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">تسوق آمن ومضمون</h4>
                                <p className="text-xs text-gray-500 mt-0.5">الدفع عند الاستلام مع ضمان الجودة</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Footer Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand Info */}
                    <div className="space-y-4 md:col-span-1 text-center md:text-right">
                        <Link to="/" className="inline-block">
                            <img src="/logo.PNG" alt="تيبس بيوتي" className="h-11 w-auto object-contain mx-auto md:mx-0" />
                        </Link>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            وجهتكم الموثوقة الأولى لمستحضرات التجميل الأصلية ومنتجات العناية بالبشرة في السودان.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-3 text-center md:text-right">
                        <h4 className="font-bold text-gray-900 text-sm">روابط سريعة</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="/" className="text-gray-600 hover:text-brand-blue transition-colors">الرئيسية</Link>
                            </li>
                            <li>
                                <Link to="/search" className="text-gray-600 hover:text-brand-blue transition-colors">تصفح المنتجات</Link>
                            </li>
                            <li>
                                <Link to="/offers" className="text-gray-600 hover:text-brand-blue transition-colors">العروض والتخفيضات</Link>
                            </li>
                            <li>
                                <Link to="/ai-chat" className="text-gray-600 hover:text-brand-blue transition-colors">مساعد الجمال الذكي (AI)</Link>
                            </li>
                        </ul>
                    </div>

                    {/* Customer Account */}
                    <div className="space-y-3 text-center md:text-right">
                        <h4 className="font-bold text-gray-900 text-sm">خدمة العملاء</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="/settings" className="text-gray-600 hover:text-brand-blue transition-colors">حسابي</Link>
                            </li>
                            <li>
                                <Link to="/profile" className="text-gray-600 hover:text-brand-blue transition-colors">الملف الشخصي</Link>
                            </li>
                            <li>
                                <Link to="/orders" className="text-gray-600 hover:text-brand-blue transition-colors">متابعة طلباتي</Link>
                            </li>
                            <li>
                                <Link to="/privacy" className="text-gray-600 hover:text-brand-blue transition-colors">سياسة الخصوصية والشروط</Link>
                            </li>
                        </ul>
                    </div>

                    {/* Contact & Support */}
                    <div className="space-y-3 text-center md:text-right">
                        <h4 className="font-bold text-gray-900 text-sm">تواصل معنا</h4>
                        <ul className="space-y-2.5 text-sm text-gray-600">
                            <li className="flex items-center justify-center md:justify-start gap-2">
                                <MapPin className="w-4 h-4 text-brand-blue shrink-0" />
                                <span>الخرطوم وبورتسودان</span>
                            </li>
                            <li className="flex items-center justify-center md:justify-start gap-2">
                                <Mail className="w-4 h-4 text-brand-blue shrink-0" />
                                <a href="mailto:tips.sudan@gmail.com" className="hover:text-brand-blue transition-colors">tips.sudan@gmail.com</a>
                            </li>
                            <li className="flex items-center justify-center md:justify-start gap-2">
                                <Phone className="w-4 h-4 text-brand-blue shrink-0" />
                                <div className="flex items-center gap-1.5" dir="ltr">
                                    <a href="tel:+249110186000" className="hover:text-brand-blue transition-colors">+249 110186000</a>
                                    <span className="text-gray-400">/</span>
                                    <a href="tel:+249900960653" className="hover:text-brand-blue transition-colors">+249 900960653</a>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Copyright */}
                <div className="border-t border-gray-100 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
                    <p>© {new Date().getFullYear()} تيبس بيوتي. جميع الحقوق محفوظة.</p>
                    <p className="flex items-center gap-1">
                        <span>صُنع بحب</span>
                        <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 inline" />
                        <span>لجمالك في السودان</span>
                    </p>
                </div>
            </div>
        </footer>
    );
};
