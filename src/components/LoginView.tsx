import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User, Warehouse } from 'lucide-react';
import { api } from '../api';
import { TRANSLATIONS } from '../i18n';
import type { Lang } from '../types';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LoginViewProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  externalError?: string;
}

export function LoginView({ lang, onLangChange, externalError }: LoginViewProps) {
  const t = TRANSLATIONS[lang];

  const [checkingInit, setCheckingInit] = useState(true);
  const [initialized, setInitialized] = useState(true);
  const [mode, setMode] = useState<'login' | 'setup'>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .checkSystemInitialized()
      .then((isInit) => {
        if (!active) return;
        setInitialized(isInit);
        setMode(isInit ? 'login' : 'setup');
      })
      .finally(() => {
        if (active) setCheckingInit(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(t.errorGeneric);
      return;
    }

    setSubmitting(true);
    try {
      await api.loginWithCredentials(username.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.errorGeneric;
      if (msg.includes('operation-not-allowed')) {
        setError(t.emailProviderDisabledHint);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      await api.setupMainAccount(password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.errorGeneric;
      if (msg.includes('operation-not-allowed')) {
        setError(t.emailProviderDisabledHint);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = error || externalError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Clean top bar */}
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {t.brandName}
          </div>
          <div className="hidden sm:block text-xs text-slate-500 whitespace-nowrap truncate">
            {t.brandSubtitle}
          </div>
          <div className="shrink-0">
            <LanguageSwitcher lang={lang} onChange={onLangChange} />
          </div>
        </div>
      </header>

      {/* Main 2-column enterprise workspace */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          {/* Left column: Operational briefing */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-8 lg:p-10">
            <div>
              <div className="text-xs font-medium text-emerald-700 tracking-wide mb-3">
                {t.brandName} · Cold-Chain Network
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-snug text-balance">
                {t.loginHeroTitle}
              </h1>
              <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                {t.loginHeroDesc}
              </p>

              <div className="mt-8 border-t border-slate-200 pt-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                    <Warehouse className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{t.loginFeature1Title}</h2>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{t.loginFeature1Desc}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{t.loginFeature3Title}</h2>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{t.loginFeature3Desc}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{t.loginFeature2Title}</h2>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{t.loginFeature2Desc}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>VN · TH · MY · CN</span>
              <span aria-hidden="true">·</span>
              <span>-18°C / -35°C IQF Pulp</span>
              <span aria-hidden="true">·</span>
              <span>CNY / USD / VND</span>
            </div>
          </div>

          {/* Right column: Pure Account + Password Card */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 lg:p-10 flex flex-col justify-center">
            {checkingInit ? (
              <div className="space-y-4">
                <div className="h-6 w-36 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ) : mode === 'setup' ? (
              <form onSubmit={handleSetup} className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{t.setupTitle}</h2>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t.setupDesc}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    {t.adminUsernameLabel}
                  </label>
                  <input
                    type="text"
                    value="admin"
                    readOnly
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
                  />
                </div>

                <div>
                  <label htmlFor="setup-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                    {t.newPasswordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-confirm" className="block text-xs font-medium text-slate-700 mb-1.5">
                    {t.confirmPasswordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="setup-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                </div>

                {displayError && (
                  <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg leading-relaxed">
                    {displayError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting ? t.signingIn : t.setupButton}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('login');
                    }}
                    className="text-xs text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                  >
                    {t.switchToLoginLink}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-900">{t.signInTitle}</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t.signInDesc}</p>

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="login-username" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t.usernameLabel}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t.usernamePlaceholder}
                        required
                        autoComplete="username"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t.passwordLabel}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.passwordPlaceholder}
                        required
                        autoComplete="current-password"
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {displayError && (
                    <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg leading-relaxed">
                      {displayError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    {submitting ? t.signingIn : t.signInButton}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-200 space-y-1.5 text-xs text-slate-500">
                  <p>{t.loginHintMain}</p>
                  <p>{t.loginHintFactory}</p>
                  {!initialized && (
                    <p className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setMode('setup');
                        }}
                        className="text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                      >
                        {t.switchToSetupLink}
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
