import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  private _onError?: (e: ErrorEvent) => void;
  private _onUnhandledRejection?: (e: PromiseRejectionEvent) => void;

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private forceHardReload = () => {
    // Clear all problematic keys from storage
    try {
      localStorage.removeItem('firestore_quota_exceeded_timestamp');
      sessionStorage.removeItem('chunk_error_reload_timestamp');
    } catch (e) {}

    // Unregister Service Workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      }).catch((err) => console.error(err));
    }

    // Purge Cache Storage
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      }).catch((err) => console.error(err));
    }

    // Perform hard reload with URL cache busting query parameter
    setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('cv', Date.now().toString());
        window.location.href = url.toString();
      } catch (err) {
        window.location.reload();
      }
    }, 150);
  };

  public componentDidMount() {
    const handleChunkError = (message: string) => {
      if (
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes('dynamic') ||
        message.includes('Importing a module script failed') ||
        message.includes('module script')
      ) {
        const lastReload = sessionStorage.getItem('chunk_error_reload_timestamp');
        const now = Date.now();
        
        // Auto-reload at most once every 15 seconds to prevent loops
        if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
          sessionStorage.setItem('chunk_error_reload_timestamp', now.toString());
          console.warn('Global handler caught dynamic chunk load error. Automatically reloading page to fetch latest build...', message);
          this.forceHardReload();
        }
      }
    };

    this._onError = (e: ErrorEvent) => {
      handleChunkError(e.message || '');
    };

    this._onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      handleChunkError(message);
    };

    window.addEventListener('error', this._onError);
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
  }

  public componentWillUnmount() {
    if (this._onError) {
      window.removeEventListener('error', this._onError);
    }
    if (this._onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    
    const errorMsg = error?.message || '';
    const isChunkError = 
      errorMsg.includes('Failed to fetch dynamically imported module') || 
      errorMsg.includes('Loading chunk') || 
      errorMsg.includes('dynamic') ||
      errorMsg.includes('Importing a module script failed') ||
      errorMsg.includes('module script') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      const lastReload = sessionStorage.getItem('chunk_error_reload_timestamp');
      const now = Date.now();
      
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem('chunk_error_reload_timestamp', now.toString());
        console.warn('React boundary caught dynamic chunk load error. Automatically reloading page to fetch latest build...', error);
        this.forceHardReload();
      }
    }
  }

  public handleReload = () => {
    this.forceHardReload();
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      const isChunkError = 
        errorMsg.includes('Failed to fetch dynamically imported module') || 
        errorMsg.includes('Loading chunk') || 
        errorMsg.includes('dynamic') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('module script') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-3xl p-10 text-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-primary to-violet-500" />
             
             <div className="w-20 h-20 bg-rose-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl border border-rose-500/20">
               <AlertTriangle className="w-10 h-10 text-rose-500" />
             </div>

             <h1 className="text-2xl font-black text-white italic tracking-tight mb-4">
               {isChunkError ? 'New Update Ready' : 'Session Interrupted'}
             </h1>
             
             <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed">
               {isChunkError 
                 ? 'A newer version of the application was deployed, or your connection was briefly interrupted. Please click below to update and restore your session.'
                 : 'The application encountered a critical error or timed out during inactivity. This usually happens when the browser manages resources or the database limit is reached.'}
             </p>

             <button 
               onClick={this.handleReload}
               className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl"
             >
               <RefreshCcw className="w-5 h-5" />
               Restore Application
             </button>
             
             <p className="mt-8 text-[10px] text-slate-600 font-mono">
               {errorMsg || 'Unknown crash'}
             </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
