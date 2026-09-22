import React from 'react';

// The shell's last line of defence: a render error in one page shows a recoverable message instead
// of a blank screen. Reloading is the honest recovery for a static SPA.

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled render error', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div role="alert" className="max-w-md mx-auto p-8 text-center">
                <h1 className="text-xl font-bold text-gray-800 mb-2">حدث خطأ غير متوقع</h1>
                <p className="text-sm text-gray-500 mb-6">لم نتمكن من عرض هذه الصفحة. حاولي إعادة التحميل، وإن استمرت المشكلة تواصلي معنا.</p>
                <button type="button" onClick={() => window.location.reload()} className="bg-brand-blue hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-control transition-colors">
                    إعادة تحميل الصفحة
                </button>
            </div>
        );
    }
}
