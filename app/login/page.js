'use client';

import { useState } from 'react';
import { Gauge as GaugeIcon, Mail, Lock, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { classNames } from '@/lib/utils';

export default function LoginPage() {
  const supabase = createClient();
  const [method, setMethod] = useState('otp'); // 'otp' | 'password'
  const [signupMode, setSignupMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function sendOtp(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setOtpSent(true);
    setInfo(`We sent a 6-digit code to ${email}. Enter it below.`);
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setLoading(false);
    if (error) { setError(error.message); return; }
    window.location.href = '/';
  }

  async function handlePassword(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);

    if (signupMode) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      if (data.session) {
        window.location.href = '/';
      } else {
        setInfo('Account created. Check your email to confirm it, then sign in.');
        setSignupMode(false);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    window.location.href = '/';
  }

  function switchMethod(next) {
    setMethod(next);
    setError(''); setInfo(''); setOtpSent(false); setCode(''); setPassword('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-signal-amber to-signal-amberDim flex items-center justify-center mb-3">
            <GaugeIcon size={20} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-xl font-semibold text-paper-100">SpendLedger</h1>
          <p className="text-xs text-paper-500 font-mono mt-1">your daily spend cockpit</p>
        </div>

        <div className="rounded-2xl border border-ink-border bg-ink-800/70 shadow-panel p-5">
          <div className="flex rounded-xl border border-ink-border bg-ink-850 p-1 mb-5">
            <button
              onClick={() => switchMethod('otp')}
              className={classNames('flex-1 text-xs font-medium py-2 rounded-lg transition-colors', method === 'otp' ? 'bg-signal-amber text-ink-950' : 'text-paper-300 hover:text-paper-100')}
            >
              Email code
            </button>
            <button
              onClick={() => switchMethod('password')}
              className={classNames('flex-1 text-xs font-medium py-2 rounded-lg transition-colors', method === 'password' ? 'bg-signal-amber text-ink-950' : 'text-paper-300 hover:text-paper-100')}
            >
              Password
            </button>
          </div>

          {method === 'otp' && !otpSent && (
            <form onSubmit={sendOtp} className="space-y-3">
              <Field icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={setEmail} required autoFocus />
              <SubmitButton loading={loading} label="Send code" />
              <p className="text-[11px] text-paper-500 text-center leading-relaxed">
                No password needed — we'll email you a one-time 6-digit code. New here? This creates your account automatically.
              </p>
            </form>
          )}

          {method === 'otp' && otpSent && (
            <form onSubmit={verifyOtp} className="space-y-3">
              <Field
                icon={ShieldCheck}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={setCode}
                required
                autoFocus
                mono
              />
              <SubmitButton loading={loading} label="Verify & sign in" />
              <button
                type="button"
                onClick={() => { setOtpSent(false); setCode(''); setInfo(''); }}
                className="w-full text-[11px] text-paper-500 hover:text-paper-100 text-center"
              >
                Use a different email
              </button>
            </form>
          )}

          {method === 'password' && (
            <form onSubmit={handlePassword} className="space-y-3">
              <Field icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={setEmail} required autoFocus />
              <Field icon={Lock} type="password" placeholder="Password" value={password} onChange={setPassword} required minLength={6} />
              <SubmitButton loading={loading} label={signupMode ? 'Create account' : 'Sign in'} />
              <button
                type="button"
                onClick={() => { setSignupMode((s) => !s); setError(''); setInfo(''); }}
                className="w-full text-[11px] text-paper-500 hover:text-paper-100 text-center"
              >
                {signupMode ? 'Already have an account? Sign in' : "New here? Create an account"}
              </button>
            </form>
          )}

          {error && <p className="text-[11px] text-signal-red mt-3 text-center">{error}</p>}
          {info && !error && <p className="text-[11px] text-signal-green mt-3 text-center">{info}</p>}
        </div>

        <p className="text-[10px] text-paper-500 text-center mt-6 font-mono">
          your data is private to your account, secured by Supabase auth
        </p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, mono, ...props }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 focus-within:border-signal-amber/60 transition-colors">
      <Icon size={14} className="text-paper-500 shrink-0" />
      <input
        {...props}
        onChange={(e) => props.onChange(e.target.value)}
        className={classNames('w-full bg-transparent outline-none text-sm text-paper-100 placeholder:text-paper-500', mono && 'font-mono tracking-[0.3em] text-center')}
      />
    </div>
  );
}

function SubmitButton({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-60 text-ink-950 font-display font-semibold text-sm py-3 transition-colors"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
      {label}
    </button>
  );
}
