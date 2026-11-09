import { useState } from 'react';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { EmptyState, Modal, PageHeader, ProgressBar, useConfirm } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { createPersonalQuest, deletePersonalQuest } from '../lib/api';
import { questView, type QuestView } from '../lib/quests';
import { refreshQuestsAfterCreate } from '../features/quests/helpers';

const PERIODS = ['daily', 'weekly', 'monthly', 'personal'] as const;

export default function Quests() {
  const { today, user, attempt, refresh } = useApp();
  const d = useData();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState(''); const [kind, setKind] = useState('complete_any'); const [area, setArea] = useState('learning'); const [target, setTarget] = useState(5);
  const views = d.quests.map((q) => questView(q, d.userQuests, today, q.created_at.slice(0, 10)));

  const card = (v: QuestView) => (
    <li key={v.quest.id} className={`card !p-4 ${v.done ? 'border-good/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className={`font-medium ${v.done ? 'text-good' : ''}`}>{v.done && '✓ '}{v.quest.title}</p>
          <p className="text-xs text-muted mt-0.5">{v.quest.description || t(`questKind.${v.quest.kind}`, { n: v.target })}</p></div>
        <div className="text-right shrink-0"><p className="text-sm font-semibold">{v.progress}/{v.target}</p>
          {v.quest.xp_reward > 0 && <p className="text-xs text-accent">+{v.quest.xp_reward} XP</p>}</div>
      </div>
      <div className="mt-3 flex items-center gap-3"><div className="flex-1"><ProgressBar pct={v.pct} height={6} label={v.quest.title} /></div>
        {v.quest.user_id && <button className="btn-ghost btn-sm !px-2 hover:!text-bad" aria-label={t('common.delete')} onClick={async () => {
          if (await confirm({ title: t('quests.deleteTitle'), message: t('quests.deleteMsg', { title: v.quest.title }), confirmLabel: t('common.delete'), danger: true })) { await attempt(() => deletePersonalQuest(v.quest.id), t('app.deleted')); await refresh(); } }}><Icon name="trash" size={15} /></button>}</div>
    </li>);

  return (
    <div>
      <PageHeader title={t('nav.quests')} subtitle={t('quests.subtitle')} actions={<button className="btn-primary" onClick={() => setForm(true)}><Icon name="plus" size={18} />{t('quests.new')}</button>} />
      <div className="space-y-8">
        {PERIODS.map((p) => { const list = views.filter((v) => v.quest.period === p);
          return (<section key={p}><h2 className="card-title">{t(`quests.${p}`)}</h2>
            {list.length ? <ul className="grid gap-3 md:grid-cols-2">{list.map(card)}</ul>
              : <div className="card"><EmptyState icon="flag" title={t('quests.none')} hint={p === 'personal' ? t('quests.personalHint') : undefined} /></div>}</section>); })}
      </div>
      <p className="text-xs text-muted mt-6">{t('quests.note')}</p>

      <Modal open={form} title={t('quests.new')} onClose={() => setForm(false)}
        footer={<><button className="btn-ghost" onClick={() => setForm(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={!title.trim() || target < 1} onClick={async () => {
            if (!user) return;
            const ok = await attempt(() => createPersonalQuest(user.id, { title: title.trim(), description: '', kind, area_code: kind === 'complete_area' ? area : null, target }).then(() => true), t('quests.created'));
            if (ok) { setForm(false); setTitle(''); await refreshQuestsAfterCreate(refresh); }
          }}>{t('common.save')}</button></>}>
        <div className="space-y-4">
          <div><label className="label" htmlFor="q-title">{t('quests.fieldTitle')}</label><input id="q-title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('quests.fieldTitleHint')} /></div>
          <div><label className="label" htmlFor="q-kind">{t('quests.fieldKind')}</label>
            <select id="q-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {['complete_any', 'complete_area', 'active_days'].map((k) => <option key={k} value={k}>{t(`questKindLabel.${k}`)}</option>)}</select></div>
          {kind === 'complete_area' && <div><label className="label" htmlFor="q-area">{t('form.area')}</label>
            <select id="q-area" className="input" value={area} onChange={(e) => setArea(e.target.value)}>{d.areas.map((a) => <option key={a.id} value={a.code}>{t(`area.${a.code}`)}</option>)}</select></div>}
          <div><label className="label" htmlFor="q-target">{t('quests.fieldTarget')}</label><input id="q-target" type="number" min={1} max={1000} className="input max-w-[140px]" value={target} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} /></div>
          <p className="text-xs text-muted">{t('quests.personalNoXp')}</p>
        </div>
      </Modal>
    </div>
  );
}
