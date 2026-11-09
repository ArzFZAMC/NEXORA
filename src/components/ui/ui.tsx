import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useI18n } from '../../i18n';

// ------------------------------------------------------------------ Modal
export function Modal({ open, title, onClose, children, footer, wide = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && panel.current) {   // jebakan fokus sederhana
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} max-h-[92dvh] flex flex-col bg-surface border border-line
          rounded-t-3xl md:rounded-3xl shadow-2xl`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm !px-2" onClick={onClose} aria-label={t('common.close')}><Icon name="x" size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex gap-2 justify-end pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Konfirmasi
interface ConfirmOptions { title: string; message: string; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} title={state?.title ?? ''} onClose={() => close(false)}
        footer={<>
          <button className="btn-ghost" onClick={() => close(false)}>{t('common.cancel')}</button>
          <button className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
            {state?.confirmLabel ?? t('common.confirm')}
          </button>
        </>}>
        <p className="text-sm text-muted leading-relaxed">{state?.message}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// ------------------------------------------------------------------ Toast
type ToastKind = 'info' | 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const color = { info: 'border-line', success: 'border-good/50', error: 'border-bad/50' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] left-0 right-0 bottom-24 md:bottom-6 flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`pointer-events-auto max-w-md w-full md:w-auto bg-elevated border ${color[i.kind]} rounded-xl px-4 py-3 text-sm shadow-xl`}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ elemen kecil
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin text-accent" role="status" aria-label="Memuat">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-10 w-1/2" /><div className="skeleton h-32" />
      <div className="grid md:grid-cols-2 gap-4"><div className="skeleton h-48" /><div className="skeleton h-48" /></div>
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4 gap-2">
      <div className="w-12 h-12 rounded-2xl bg-elevated border border-line grid place-items-center text-accent"><Icon name={icon} /></div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted max-w-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card border-bad/40 flex items-start gap-3" role="alert">
      <Icon name="alert" className="text-bad shrink-0 mt-0.5" />
      <div className="flex-1"><p className="text-sm">{message}</p>
        {onRetry && <button className="btn-ghost btn-sm mt-3" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    </div>
  );
}

export function ProgressBar({ pct, label, height = 8 }: { pct: number; label?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className="w-full rounded-full bg-elevated overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-1 rounded-xl bg-elevated border border-line gap-1 flex-wrap">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`px-3 min-h-[36px] rounded-lg text-xs font-medium transition ${value === o.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
      <div><h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}</div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
