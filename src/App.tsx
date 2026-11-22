import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AdminDashboard } from './components/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FactoryPortal } from './components/FactoryPortal';
import { LoginView } from './components/LoginView';
import { auth } from './firebase';
import { TRANSLATIONS } from './i18n';
import type { AuthUser, Lang } from './types';

function getInitialLang(): Lang {
  try {
    const saved = window.localStorage.getItem('durian_vault_lang');
    if (saved === 'zh' || saved === 'en' || saved === 'vi') return saved;
  } catch {
    // Ignore storage unavailability
  }
  return 'zh';
}

function AppContent() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState('');

  const handleLangChange = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem('durian_vault_lang', next);
    } catch {
      // Ignore storage unavailability
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      setAuthError('');
      try {
        const resolved = await api.resolveAuthenticatedUser(fbUser);
        if (!resolved) {
          await api.logout();
          setUser(null);
          setAuthError(TRANSLATIONS[langRef.current].unassignedAccountError);
        } else {
          setUser(resolved);
        }
      } catch (err) {
        await api.logout().catch(() => {});
        setUser(null);
        setAuthError(err instanceof Error ? err.message : TRANSLATIONS[langRef.current].errorGeneric);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    setAuthError('');
    void api.logout();
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-64 space-y-3">
          <div className="h-4 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView lang={lang} onLangChange={handleLangChange} externalError={authError} />;
  }

  if (user.role === 'admin') {
    return (
      <AdminDashboard
        adminUsername={user.username}
        lang={lang}
        onLangChange={handleLangChange}
        onLogout={handleLogout}
      />
    );
  }

  if (user.factory) {
    return (
      <FactoryPortal
        factory={user.factory}
        lang={lang}
        onLangChange={handleLangChange}
        onLogout={handleLogout}
      />
    );
  }

  return <LoginView lang={lang} onLangChange={handleLangChange} externalError={authError} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
