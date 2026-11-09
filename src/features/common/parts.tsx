import { useEffect, useState } from 'react';
import { useApp, useData } from '../../app/AppContext';
import { useI18n } from '../../i18n';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/ui';
import { shortTime } from '../../lib/date';
import { xpForDifficulty } from '../../lib/gamification';
import type { Instance } from '../../lib/types';
import { useActivityForm } from '../activities/FormHost';

export const AREA_COLORS: Record<string, string> = {
  spiritual: '#34d399', learning: '#60a5fa', career: '#fbbf24', health: '#fb7185', personal: '#a78bfa', entertainment: '#22d3ee',
};

export function AreaDot({ code, size = 8 }: { code: string; size?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: AREA_COLORS[code] ?? '#94a3b8' }} aria-hidden="true" />;
}

export function AreaChip({ areaId }: { areaId: number }) {
  const { areas } = useData();
  const { t } = useI18n();
  const a = areas.find((x) => x.id === areaId);
  if (!a) return null;
  return <span className="chip"><AreaDot code={a.code} />{t(`area.${a.code}`)}</span>;
}

export function StatusBadge({ status }: { status: Instance['status'] }) {
  const { t } = useI18n();
  const cls = { planned: 'text-accent border-accent/40', completed: 'text-good border-good/40', skipped: 'text-muted border-line', missed: 'text-warn border-warn/40' }[status];
  return <span className={`chip ${cls}`}>{t(`status.${status}`)}</span>;
}

export function RescheduleModal({ instance, onClose }: { instance: Instance | null; onClose: () => void }) {
  const { reschedule, today } = useApp();
  const { t } = useI18n();
  const [date, setDate] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (instance) { setDate(instance.scheduled_date < today ? today : instance.scheduled_date); setStart(shortTime(instance.start_time)); setEnd(shortTime(instance.end_time)); }
  }, [instance, today]);
  const invalid = !date || (start && end && end <= start);
  return (
    <Modal open={!!instance} title={t('activity.reschedule')} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={!!invalid || busy} onClick={async () => {
          if (!instance) return; setBusy(true);
          const ok = await reschedule(instance, date, start || null, end || null); setBusy(false); if (ok) onClose();
        }}>{t('common.save')}</button>
      </>}>
      <div className="space-y-4">
        <div><label className="label" htmlFor="rs-date">{t('form.date')}</label><input id="rs-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="rs-start">{t('form.startTime')}</label><input id="rs-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><label className="label" htmlFor="rs-end">{t('form.endTime')}</label><input id="rs-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        {start && end && end <= start && <p className="text-xs text-bad">{t('form.errEndTime')}</p>}
      </div>
    </Modal>
  );
}

export function NotesModal({ instance, onClose }: { instance: Instance | null; onClose: () => void }) {
  const { saveNotes } = useApp();
  const { t } = useI18n();
  const [text, setText] = useState('');
  useEffect(() => { if (instance) setText(instance.notes); }, [instance]);
  return (
    <Modal open={!!instance} title={t('activity.notes')} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={async () => { if (instance) await saveNotes(instance, text.slice(0, 2000)); onClose(); }}>{t('common.save')}</button></>}>
      <label className="label" htmlFor="notes-t">{instance?.title}</label>
      <textarea id="notes-t" className="input" rows={6} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('activity.notesHint')} />
      <p className="text-xs text-muted mt-1 text-right">{text.length}/2000</p>
    </Modal>
  );
}

/** Baris aktivitas: aksi selesai / lewati / pindah / catatan / hapus. */
export function InstanceRow({ i, showDate = false }: { i: Instance; showDate?: boolean }) {
  const { complete, skip, removeInstance } = useApp();
  const { areas } = useData();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [resched, setResched] = useState(false);
  const [notes, setNotes] = useState(false);
  const area = areas.find((a) => a.id === i.life_area_id);
  const done = i.status === 'completed';
  const time = i.start_time ? `${shortTime(i.start_time)}${i.end_time ? '–' + shortTime(i.end_time) : ''}` : t('activity.allDay');
  const dateLabel = showDate
    ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(i.scheduled_date + 'T00:00:00Z')) : '';

  return (
    <li className={`flex items-start gap-3 rounded-xl border border-line bg-elevated/40 p-3 ${done ? 'opacity-75' : ''}`}>
      <button onClick={() => void complete(i)} disabled={done} aria-label={done ? t('status.completed') : t('activity.complete')}
        className={`mt-0.5 w-7 h-7 shrink-0 rounded-full border grid place-items-center transition ${done ? 'bg-good border-good text-bg' : 'border-line hover:border-accent hover:text-accent'}`}>
        {done && <Icon name="check" size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-medium truncate ${done ? 'line-through decoration-muted/60' : ''}`}>{i.title}</p>
          {i.template_id && !i.is_exception && <Icon name="repeat" size={13} className="text-muted" />}
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 text-xs text-muted mt-1 flex-wrap">
          {dateLabel && <span>{dateLabel}</span>}<span>{time}</span>
          {area && <span className="inline-flex items-center gap-1.5"><AreaDot code={area.code} />{t(`area.${area.code}`)}</span>}
          <span>+{xpForDifficulty(i.difficulty)} XP</span>
          {i.status !== 'planned' && i.status !== 'completed' && <StatusBadge status={i.status} />}
        </div>
        {i.notes && <p className="text-xs text-muted mt-1.5 line-clamp-2">“{i.notes}”</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {!done && i.status !== 'skipped' && <button className="btn-ghost btn-sm !px-2" aria-label={t('activity.skip')} title={t('activity.skip')} onClick={() => void skip(i)}><Icon name="skip" size={15} /></button>}
        {!done && <button className="btn-ghost btn-sm !px-2" aria-label={t('activity.reschedule')} title={t('activity.reschedule')} onClick={() => setResched(true)}><Icon name="calendar" size={15} /></button>}
        <button className="btn-ghost btn-sm !px-2" aria-label={t('activity.notes')} title={t('activity.notes')} onClick={() => setNotes(true)}><Icon name="edit" size={15} /></button>
        {!done && <button className="btn-ghost btn-sm !px-2 hover:!text-bad" aria-label={t('common.delete')} title={t('common.delete')}
          onClick={async () => { if (await confirm({ title: t('activity.deleteTitle'), message: t('activity.deleteMsg', { title: i.title }), confirmLabel: t('common.delete'), danger: true })) await removeInstance(i); }}>
          <Icon name="trash" size={15} /></button>}
      </div>
      <RescheduleModal instance={resched ? i : null} onClose={() => setResched(false)} />
      <NotesModal instance={notes ? i : null} onClose={() => setNotes(false)} />
    </li>
  );
}

export function InstanceList({ items, showDate }: { items: Instance[]; showDate?: boolean }) {
  return <ul className="space-y-2">{items.map((i) => <InstanceRow key={i.id} i={i} showDate={showDate} />)}</ul>;
}

export function useEditActivity() {
  const { open } = useActivityForm();
  const data = useData();
  return (i: Instance) => { const tpl = data.templates.find((t) => t.id === i.template_id); open(tpl ?? null); };
}
