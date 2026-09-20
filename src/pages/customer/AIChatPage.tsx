import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import { askBeautyAdvice } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useAuth } from '../../context/AuthContext';

export const AIChatPage: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string }[]>([
        { role: 'bot', text: 'أهلاً بك في Tips Beauty! كيف يمكنني مساعدتك اليوم؟ نحن نهتم بجمالك.' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setIsTyping(true);

        try {
            const response = await askBeautyAdvice(userMessage);
            setMessages(prev => [...prev, { role: 'bot', text: response || 'عذراً، لم أستطع فهم طلبك.' }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'bot', text: errorMessage(error, 'عذراً، حدث خطأ. حاولي مرة أخرى.') }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    if (!authLoading && !user) {
        return (
            <div className="max-w-md mx-auto p-8 text-center">
                <Sparkles className="w-12 h-12 text-brand-blue mx-auto mb-4" />
                <h1 className="text-xl font-bold text-gray-800 mb-2">مساعد تيبس بيوتي الذكي</h1>
                <p className="text-gray-600 mb-6">سجلي الدخول للحصول على نصائح جمال مخصصة لك.</p>
                <Link to="/login" state={{ from: { pathname: '/ai-chat' } }} className="inline-block bg-brand-blue text-white font-bold py-3 px-8 rounded-xl">
                    تسجيل الدخول
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 h-[calc(100vh-80px)] flex flex-col">
            <div className="mb-4">
                <Link to="/" className="text-brand-blue text-sm hover:underline">
                    ← العودة للرئيسية
                </Link>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-brand-blue to-teal-500 p-4 text-white">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-6 h-6" />
                        <div>
                            <h1 className="font-bold text-lg">مساعد تيبس بيوتي الذكي</h1>
                            <p className="text-xs text-blue-100">اسأليني عن أي شيء يتعلق بالجمال والعناية</p>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                    ? 'bg-brand-blue text-white'
                                    : 'bg-gray-100 text-gray-800'
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-2xl px-4 py-3">
                                <div className="flex gap-1" role="status" aria-label="جاري الكتابة">
                                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-gray-100 p-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="اكتبي سؤالك هنا..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50"
                            disabled={isTyping}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isTyping}
                            className="bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all active:scale-95"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
