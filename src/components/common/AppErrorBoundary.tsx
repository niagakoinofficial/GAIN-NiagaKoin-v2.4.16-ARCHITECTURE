import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientEvent } from '../../services/observabilityService';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportClientEvent('client.render.error', { errorName: error.name || 'Error' });
    console.error('[APP_RENDER_ERROR]', {
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-[var(--app-background)] text-[var(--app-foreground)] px-5 text-center">
          <div className="max-w-md">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Halaman tidak dapat dimuat</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Terjadi kendala saat menampilkan aplikasi.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
            >
              Muat ulang
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
