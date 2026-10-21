import React, { useEffect, useRef, useState } from 'react';

interface LoginPageProps {
  onLoginSuccess: (rememberMe: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  const configuredPassword = (import.meta.env.VITE_ADMIN_PASSWORD || '').trim();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying || isSuccess) return;
    setError(null);

    const enteredPassword = password.trim();

    if (!enteredPassword) {
      setError('Please enter your administrator password.');
      return;
    }

    if (!configuredPassword) {
      setError('Administrator authentication is not configured. Contact the system owner.');
      return;
    }

    setIsVerifying(true);

    verifyTimerRef.current = setTimeout(() => {
      if (enteredPassword === configuredPassword) {
        setIsSuccess(true);
        successTimerRef.current = setTimeout(() => {
          onLoginSuccess(rememberMe);
        }, 400);
      } else {
        setIsVerifying(false);
        setError('Incorrect password. Please try again.');
      }
    }, 250);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 py-10 text-slate-950 selection:bg-violet-200 selection:text-slate-950 sm:px-6">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-violet-200/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-52 -right-40 h-[30rem] w-[30rem] rounded-full bg-purple-200/65 blur-3xl" />

      <div className="relative z-10 w-full max-w-md min-[768px]:max-[1024px]:max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Trusty Yellow Cab</h1>
          <p className="mt-2 text-base text-slate-500">Admin</p>
        </div>

        <div className="rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none sm:rounded-3xl sm:border sm:border-slate-100 sm:bg-white/90 sm:p-8 sm:shadow-[0_18px_50px_rgba(99,72,160,0.12)] sm:backdrop-blur">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-950">Sign In</h2>

          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium leading-relaxed text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="admin-password" className="sr-only">Password</label>
              <input
                id="admin-password"
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Password"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>Keep me logged in</span>
            </label>

            <button
              type="submit"
              disabled={isVerifying || isSuccess}
              className="w-full rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSuccess ? 'Access Granted' : isVerifying ? 'Verifying...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-500">
          <a
            href="/privacy-policy"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/privacy-policy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="cursor-pointer font-medium underline transition hover:text-slate-800"
          >
            Privacy Policy
          </a>
          <span aria-hidden="true">•</span>
          <a
            href="/account-deletion"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/account-deletion');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="cursor-pointer font-medium underline transition hover:text-slate-800"
          >
            Account Deletion
          </a>
        </div>
      </div>
    </div>
  );
};
