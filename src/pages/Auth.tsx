import { useState } from 'react';
import { useI18n } from '../i18n';
import { Segmented, Spinner } from '../components/ui/ui';
import * as api from '../lib/api';

type Mode = 'login' | 'magic' | 'register';

export default function Auth() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!emailOk) return setMsg({ kind: 'err', text: t('auth.errEmail') });
    if (mode !== 'magic' && password.length < 8) return setMsg({ kind: 'err', text: t('auth.errPassword') });
    if (mode === 'register' && !/^[A-Za-z0-9]{8,32}$/.test(code.trim())) return setMsg({ kind: 'err', text: t('auth.errCode') });
    setBusy(true);
    try {
      if (mode === 'login') await api.signInPassword(email, password);
      else if (mode === 'magic') { await api.sendMagicLink(email); setMsg({ kind: 'ok', text: t('auth.magicSent') }); }
      else {
        await api.redeemInvite({ code: code.trim(), email, password, displayName: name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        await api.signInPassword(email, password);
      }
    } catch (err) { setMsg({ kind: 'err', text: (err as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/icons/icon-192.png" alt="" width={64} height={64} className="mx-auto rounded-2xl shadow-glow" />
          <h1 className="text-3xl font-bold mt-4 tracking-wide">NEXORA</h1>
          <p className="text-muted mt-1">{t('app.tagline')}</p>
        </div>
        <div className="card">
          <div className="mb-5 flex justify-center">
            <Segmented label={t('auth.mode')} value={mode} onChange={(m) => { setMode(m); setMsg(null); }}
              options={[{ value: 'login', label: t('auth.login') }, { value: 'magic', label: t('auth.magic') }, { value: 'register', label: t('auth.register') }]} />
          </div>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {mode === 'register' && (<>
              <div><label className="label" htmlFor="a-code">{t('auth.inviteCode')}</label>
                <input id="a-code" className="input uppercase tracking-widest" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} /></div>
              <div><label className="label" htmlFor="a-name">{t('auth.displayName')}</label>
                <input id="a-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            </>)}
            <div><label className="label" htmlFor="a-email">{t('auth.email')}</label>
              <input id="a-email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {mode !== 'magic' && (
              <div><label className="label" htmlFor="a-pass">{t('auth.password')}</label>
                <input id="a-pass" type="password" className="input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
                {mode === 'register' && <p className="text-xs text-muted mt-1">{t('auth.passwordHint')}</p>}</div>)}
            {msg && <p className={`text-sm ${msg.kind === 'ok' ? 'text-good' : 'text-bad'}`} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner size={18} /> : t(mode === 'login' ? 'auth.login' : mode === 'magic' ? 'auth.sendMagic' : 'auth.createAccount')}</button>
          </form>
          <p className="text-xs text-muted mt-5 text-center">{t('auth.inviteOnly')}</p>
        </div>
      </div>
    </div>
  );
}
