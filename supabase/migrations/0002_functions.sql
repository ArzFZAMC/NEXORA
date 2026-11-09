-- NEXORA — 0002: logika inti di database (atomik, idempoten)

-- ---------------------------------------------------------------- util
create or replace function public.user_tz(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.profiles where id = p_user), 'Asia/Jakarta');
$$;

create or replace function public.user_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone public.user_tz(p_user))::date;
$$;

create or replace function public.xp_for_difficulty(p_difficulty text)
returns integer language sql immutable as $$
  select case p_difficulty when 'easy' then 10 when 'normal' then 20 when 'hard' then 35 when 'challenge' then 50 else 20 end;
$$;

-- Level n dimulai pada 50*(n-1)*n XP (L2=100, L3=300, L4=600 ...). Sama dengan src/lib/gamification.ts
create or replace function public.level_from_xp(p_xp bigint)
returns integer language sql immutable as $$
  select floor((1 + sqrt(1 + greatest(p_xp, 0)::numeric / 12.5)) / 2)::integer;
$$;

-- Aturan pengulangan. Sama dengan src/lib/recurrence.ts (occursOn)
create or replace function public.template_occurs_on(t public.activity_templates, d date)
returns boolean language sql immutable as $$
  select case
    when not t.is_active then false
    when d < t.start_date then false
    when t.end_date is not null and d > t.end_date then false
    when t.recurrence_type = 'none' then d = t.start_date
    when t.recurrence_type = 'daily' then true
    when t.recurrence_type = 'weekly' then
      extract(dow from d)::smallint = any (
        case when cardinality(t.recurrence_days) = 0
             then array[extract(dow from t.start_date)::smallint]
             else t.recurrence_days end)
    when t.recurrence_type = 'custom' then extract(dow from d)::smallint = any (t.recurrence_days)
    when t.recurrence_type = 'monthly' then
      extract(day from d)::integer = least(
        coalesce(t.day_of_month, extract(day from t.start_date)::integer),
        extract(day from (date_trunc('month', d::timestamp) + interval '1 month' - interval '1 day'))::integer)
    else false
  end;
$$;

-- ---------------------------------------------------------------- guard trigger instance
create or replace function public.guard_instance()
returns trigger language plpgsql as $$
declare
  v_allow boolean := coalesce(current_setting('nexora.rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'planned' and not v_allow then
      raise exception 'instance baru harus berstatus planned';
    end if;
    return new;
  end if;

  if new.user_id <> old.user_id then
    raise exception 'user_id tidak boleh diubah';
  end if;
  if new.status = 'completed' and old.status <> 'completed' and not v_allow then
    raise exception 'gunakan complete_instance() untuk menyelesaikan aktivitas';
  end if;
  if old.status = 'completed' then
    if new.status <> 'completed'
       or new.scheduled_date <> old.scheduled_date
       or new.title <> old.title
       or new.difficulty <> old.difficulty
       or new.life_area_id <> old.life_area_id
       or new.completed_at is distinct from old.completed_at
       or new.is_hidden <> old.is_hidden then
      raise exception 'aktivitas yang sudah selesai tidak dapat diubah (hanya catatan)';
    end if;
  end if;
  return new;
end $$;

create trigger instances_guard before insert or update on public.activity_instances
  for each row execute function public.guard_instance();

-- Kuest pribadi tidak memberi XP (mencegah farming XP)
create or replace function public.guard_quest()
returns trigger language plpgsql as $$
begin
  if new.user_id is not null then
    new.xp_reward := 0;
    new.period := 'personal';
  end if;
  return new;
end $$;
create trigger quests_guard before insert or update on public.quests
  for each row execute function public.guard_quest();

-- ---------------------------------------------------------------- statistik harian
create or replace function public.recompute_stats(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tz text := public.user_tz(p_user);
  v_planned int; v_completed int; v_skipped int; v_missed int; v_xp int;
  v_rest boolean; v_by_area jsonb;
begin
  select count(*) filter (where status = 'planned'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'skipped'),
         count(*) filter (where status = 'missed')
    into v_planned, v_completed, v_skipped, v_missed
    from public.activity_instances
   where user_id = p_user and scheduled_date = p_date and not is_hidden;

  select coalesce(sum(amount), 0) into v_xp
    from public.xp_transactions
   where user_id = p_user and (created_at at time zone v_tz)::date = p_date;

  select exists (select 1 from public.rest_days where user_id = p_user and rest_date = p_date) into v_rest;

  select coalesce(jsonb_object_agg(s.code, s.c), '{}'::jsonb) into v_by_area
    from (select la.code, count(*) as c
            from public.activity_instances i
            join public.life_areas la on la.id = i.life_area_id
           where i.user_id = p_user and i.scheduled_date = p_date
                 and i.status = 'completed' and not i.is_hidden
           group by la.code) s;

  if v_planned + v_completed + v_skipped + v_missed = 0 and v_xp = 0 and not v_rest then
    delete from public.daily_statistics where user_id = p_user and stat_date = p_date;
    return;
  end if;

  insert into public.daily_statistics (user_id, stat_date, planned, completed, skipped, missed, xp_earned, is_rest_day, by_area)
  values (p_user, p_date, v_planned, v_completed, v_skipped, v_missed, v_xp, v_rest, v_by_area)
  on conflict (user_id, stat_date) do update
    set planned = excluded.planned, completed = excluded.completed, skipped = excluded.skipped,
        missed = excluded.missed, xp_earned = excluded.xp_earned, is_rest_day = excluded.is_rest_day,
        by_area = excluded.by_area;
end $$;

create or replace function public.instances_stats_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform public.recompute_stats(old.user_id, old.scheduled_date);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    -- instance masa depan yang baru dibuat tidak perlu dihitung (menghindari beban saat generate)
    if tg_op = 'UPDATE' or new.scheduled_date <= public.user_today(new.user_id) then
      perform public.recompute_stats(new.user_id, new.scheduled_date);
    end if;
  end if;
  return null;
end $$;
create trigger instances_stats after insert or update or delete on public.activity_instances
  for each row execute function public.instances_stats_trigger();

create or replace function public.rest_days_stats_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.recompute_stats(old.user_id, old.rest_date); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.recompute_stats(new.user_id, new.rest_date); end if;
  return null;
end $$;
create trigger rest_days_stats after insert or update or delete on public.rest_days
  for each row execute function public.rest_days_stats_trigger();

-- ---------------------------------------------------------------- generator instance
create or replace function public.generate_instances_for(p_user uuid, p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.user_today(p_user);
  v_from  date := greatest(p_from, public.user_today(p_user));   -- tidak pernah membuat riwayat masa lalu
  v_to    date := least(p_to, public.user_today(p_user) + 120);
  v_n     integer;
begin
  if v_to < v_from then return 0; end if;
  insert into public.activity_instances
    (user_id, template_id, scheduled_date, title, description, life_area_id, difficulty, start_time, end_time)
  select t.user_id, t.id, d::date, t.title, t.description, t.life_area_id, t.difficulty, t.start_time, t.end_time
    from public.activity_templates t
   cross join generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
   where t.user_id = p_user
     and public.template_occurs_on(t, d::date)
     and not exists (select 1 from public.rest_days r where r.user_id = p_user and r.rest_date = d::date)
  on conflict (template_id, scheduled_date) where template_id is not null and not is_exception do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.mark_missed_for(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.user_today(p_user);
  v_n integer;
begin
  update public.activity_instances i
     set status = 'missed'
   where i.user_id = p_user and i.status = 'planned' and not i.is_hidden
     and i.scheduled_date < v_today
     and not exists (select 1 from public.rest_days r where r.user_id = p_user and r.rest_date = i.scheduled_date);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Dipanggil klien saat aplikasi dibuka: buat instance 60 hari ke depan + tandai yang terlewat
create or replace function public.sync_schedule(p_days integer default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_created integer; v_missed integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_created := public.generate_instances_for(v_uid, public.user_today(v_uid), public.user_today(v_uid) + least(greatest(p_days, 1), 120));
  v_missed  := public.mark_missed_for(v_uid);
  return jsonb_build_object('created', v_created, 'missed', v_missed, 'today', public.user_today(v_uid));
end $$;

-- Dipanggil cron untuk semua user
create or replace function public.generate_all_instances()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_total integer := 0;
begin
  for r in select id from public.profiles loop
    v_total := v_total + public.generate_instances_for(r.id, public.user_today(r.id), public.user_today(r.id) + 60);
    perform public.mark_missed_for(r.id);
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------- template: refresh / stop / delete
create or replace function public.refresh_template_instances(p_template uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  t public.activity_templates;
  v_today date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into t from public.activity_templates where id = p_template and user_id = v_uid;
  if not found then raise exception 'template tidak ditemukan'; end if;
  v_today := public.user_today(v_uid);

  -- 1) perbarui instance mendatang yang belum disentuh user
  update public.activity_instances i
     set title = t.title, description = t.description, life_area_id = t.life_area_id,
         difficulty = t.difficulty, start_time = t.start_time, end_time = t.end_time
   where i.template_id = t.id and i.status = 'planned' and not i.is_exception and not i.is_hidden
     and i.scheduled_date >= v_today and public.template_occurs_on(t, i.scheduled_date);

  -- 2) hapus instance mendatang yang tidak lagi sesuai aturan (riwayat lampau & yang selesai tidak disentuh)
  delete from public.activity_instances i
   where i.template_id = t.id and i.status = 'planned' and not i.is_exception
     and i.scheduled_date >= v_today and not public.template_occurs_on(t, i.scheduled_date);

  -- 3) isi yang kurang
  perform public.generate_instances_for(v_uid, v_today, v_today + 60);
end $$;

create or replace function public.stop_template(p_template uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_today := public.user_today(v_uid);
  update public.activity_templates
     set is_active = false,
         end_date = case when start_date <= v_today - 1 then v_today - 1 else end_date end
   where id = p_template and user_id = v_uid;
  if not found then raise exception 'template tidak ditemukan'; end if;
  perform public.refresh_template_instances(p_template);
end $$;

create or replace function public.delete_template(p_template uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform 1 from public.activity_templates where id = p_template and user_id = v_uid;
  if not found then raise exception 'template tidak ditemukan'; end if;
  v_today := public.user_today(v_uid);
  -- hanya jadwal mendatang yang belum disentuh yang dibuang; riwayat tetap (template_id menjadi null)
  delete from public.activity_instances
   where template_id = p_template and user_id = v_uid and status = 'planned' and scheduled_date >= v_today;
  delete from public.activity_instances
   where template_id = p_template and user_id = v_uid and is_hidden;
  delete from public.activity_templates where id = p_template and user_id = v_uid;
end $$;

-- ---------------------------------------------------------------- instance: complete / skip / reschedule / delete
create or replace function public.skip_instance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select status into v_status from public.activity_instances where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'aktivitas tidak ditemukan'; end if;
  if v_status = 'completed' then raise exception 'aktivitas yang sudah selesai tidak dapat dilewati'; end if;
  update public.activity_instances set status = 'skipped' where id = p_id;
end $$;

create or replace function public.reschedule_instance(
  p_id uuid, p_date date, p_start time default null, p_end time default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.activity_instances;
  v_new uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into i from public.activity_instances where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'aktivitas tidak ditemukan'; end if;
  if i.status = 'completed' then raise exception 'aktivitas yang sudah selesai tidak dapat dipindah'; end if;
  if i.template_id is not null and exists (
       select 1 from public.activity_instances x
        where x.template_id = i.template_id and x.scheduled_date = p_date
          and not x.is_hidden and x.id <> i.id) then
    raise exception 'aktivitas ini sudah ada pada tanggal tersebut';
  end if;

  if i.template_id is null then
    update public.activity_instances
       set scheduled_date = p_date, start_time = p_start, end_time = p_end,
           status = 'planned', is_exception = true, reminder_sent_at = null
     where id = p_id;
    return p_id;
  end if;

  -- instance terhubung template: tinggalkan "nisan" tersembunyi agar slot asal tidak dibuat ulang,
  -- lalu buat salinan pada tanggal baru.
  update public.activity_instances set is_hidden = true, status = 'skipped' where id = p_id;
  insert into public.activity_instances
    (user_id, template_id, scheduled_date, title, description, life_area_id, difficulty,
     start_time, end_time, notes, is_exception)
  values (v_uid, i.template_id, p_date, i.title, i.description, i.life_area_id, i.difficulty,
          p_start, p_end, i.notes, true)
  returning id into v_new;
  return v_new;
end $$;

create or replace function public.delete_instance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text; v_template uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select status, template_id into v_status, v_template
    from public.activity_instances where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'aktivitas tidak ditemukan'; end if;
  if v_status = 'completed' then raise exception 'aktivitas yang sudah selesai tidak dapat dihapus'; end if;
  if v_template is null then
    delete from public.activity_instances where id = p_id;
  else
    update public.activity_instances set is_hidden = true, status = 'skipped' where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------- streak
-- Hari aktif = ada aktivitas selesai (tanggal lokal user). Hari istirahat: tidak memutus & tidak menambah streak.
create or replace function public.streak_info(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.user_tz(p_user);
  v_today date := public.user_today(p_user);
  v_active date[];
  v_rest date[];
  v_first date;
  d date; run int := 0; best int := 0; cur int := 0;
  w date; wk_start date; wk_days int; wk_cur int := 0; wk_best int := 0; wk_run int := 0;
  v_week0 date := date_trunc('week', v_today::timestamp)::date;
  v_started boolean := false;
begin
  select coalesce(array_agg(distinct (completed_at at time zone v_tz)::date), '{}') into v_active
    from public.activity_instances where user_id = p_user and status = 'completed';
  select coalesce(array_agg(rest_date), '{}') into v_rest from public.rest_days where user_id = p_user;
  if cardinality(v_active) = 0 then
    return jsonb_build_object('current_daily', 0, 'best_daily', 0, 'current_weekly', 0, 'best_weekly', 0);
  end if;
  select min(x) into v_first from unnest(v_active) x;

  -- best (maju)
  d := v_first;
  while d <= v_today loop
    if d = any (v_active) then run := run + 1; best := greatest(best, run);
    elsif d = any (v_rest) then null;
    else run := 0; end if;
    d := d + 1;
  end loop;

  -- current (mundur dari hari ini; hari ini yang belum aktif diberi kelonggaran)
  d := v_today;
  if not (d = any (v_active)) and not (d = any (v_rest)) then d := d - 1; end if;
  while d >= v_first - 1 loop
    if d = any (v_active) then cur := cur + 1;
    elsif d = any (v_rest) then null;
    else exit; end if;
    d := d - 1;
  end loop;

  -- weekly: minggu (Senin-Minggu) dengan >= 3 hari aktif/istirahat
  w := date_trunc('week', v_first::timestamp)::date;
  while w <= v_week0 loop
    select count(*) into wk_days from generate_series(w::timestamp, (w + 6)::timestamp, interval '1 day') g
      where g::date = any (v_active) or g::date = any (v_rest);
    if wk_days >= 3 then wk_run := wk_run + 1; wk_best := greatest(wk_best, wk_run);
    else wk_run := 0; end if;
    w := w + 7;
  end loop;
  w := v_week0;
  v_started := false;
  while w >= date_trunc('week', v_first::timestamp)::date loop
    select count(*) into wk_days from generate_series(w::timestamp, (w + 6)::timestamp, interval '1 day') g
      where g::date = any (v_active) or g::date = any (v_rest);
    if wk_days >= 3 then wk_cur := wk_cur + 1;
    elsif w = v_week0 then null;          -- minggu berjalan belum dihitung gagal
    else exit; end if;
    w := w - 7;
  end loop;

  return jsonb_build_object('current_daily', cur, 'best_daily', best, 'current_weekly', wk_cur, 'best_weekly', wk_best);
end $$;

-- ---------------------------------------------------------------- quest, achievement, progres
create or replace function public.quest_progress(p_user uuid, q public.quests, p_start date, p_end date)
returns integer language sql stable security definer set search_path = public as $$
  select case q.kind
    when 'active_days' then
      (select count(distinct i.scheduled_date) from public.activity_instances i
        where i.user_id = p_user and i.status = 'completed' and not i.is_hidden
          and i.scheduled_date between p_start and p_end)
    when 'complete_area' then
      (select count(*) from public.activity_instances i
         join public.life_areas la on la.id = i.life_area_id
        where i.user_id = p_user and i.status = 'completed' and not i.is_hidden
          and la.code = q.area_code and i.scheduled_date between p_start and p_end)
    else
      (select count(*) from public.activity_instances i
        where i.user_id = p_user and i.status = 'completed' and not i.is_hidden
          and i.scheduled_date between p_start and p_end)
  end::integer;
$$;

create or replace function public.award_xp(p_user uuid, p_ref text, p_reason text, p_amount integer, p_instance uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if p_amount <= 0 then return false; end if;
  insert into public.xp_transactions (user_id, instance_id, ref_key, reason, amount)
  values (p_user, p_instance, p_ref, p_reason, p_amount)
  on conflict (user_id, ref_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function public.refresh_progress(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.user_today(p_user);
  q public.quests; a public.achievements;
  v_start date; v_end date; v_prog integer;
  v_total bigint; v_metric bigint; v_streak jsonb;
  v_pass integer := 0; v_changed boolean;
  m record;
begin
  loop
    v_pass := v_pass + 1; v_changed := false;

    for q in select * from public.quests where is_active and (user_id is null or user_id = p_user) loop
      if q.period = 'daily' then v_start := v_today; v_end := v_today;
      elsif q.period = 'weekly' then v_start := date_trunc('week', v_today::timestamp)::date; v_end := v_start + 6;
      elsif q.period = 'monthly' then
        v_start := date_trunc('month', v_today::timestamp)::date;
        v_end := (date_trunc('month', v_today::timestamp) + interval '1 month' - interval '1 day')::date;
      else v_start := (q.created_at at time zone public.user_tz(p_user))::date; v_end := date '9999-12-31';
      end if;
      v_prog := public.quest_progress(p_user, q, v_start, v_end);
      if v_prog = 0 and not exists (select 1 from public.user_quests where user_id = p_user and quest_id = q.id and period_start = v_start) then
        continue;
      end if;
      insert into public.user_quests (user_id, quest_id, period_start, progress, completed_at)
      values (p_user, q.id, v_start, v_prog, case when v_prog >= q.target then now() end)
      on conflict (user_id, quest_id, period_start) do update
        set progress = excluded.progress,
            completed_at = coalesce(public.user_quests.completed_at, excluded.completed_at);
      if v_prog >= q.target and q.xp_reward > 0 then
        if public.award_xp(p_user, 'quest:' || q.id || ':' || v_start, 'quest_complete', q.xp_reward) then
          v_changed := true;
        end if;
      end if;
    end loop;

    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = p_user;
    v_streak := public.streak_info(p_user);

    for a in select * from public.achievements
              where id not in (select achievement_id from public.user_achievements where user_id = p_user) loop
      v_metric := case a.kind
        when 'total_completed' then (select count(*) from public.activity_instances where user_id = p_user and status = 'completed')
        when 'streak' then (v_streak ->> 'best_daily')::bigint
        when 'level' then public.level_from_xp(v_total)
        when 'xp_total' then v_total
        when 'area_completed' then (select count(*) from public.activity_instances i join public.life_areas la on la.id = i.life_area_id
                                     where i.user_id = p_user and i.status = 'completed' and la.code = a.area_code)
        else 0 end;
      if v_metric >= a.threshold then
        insert into public.user_achievements (user_id, achievement_id) values (p_user, a.id) on conflict do nothing;
        if a.xp_reward > 0 and public.award_xp(p_user, 'ach:' || a.id, 'achievement', a.xp_reward) then
          v_changed := true;
        end if;
      end if;
    end loop;

    -- milestone streak harian
    for m in select * from (values (7, 50), (30, 200), (100, 500)) as t(days, reward) loop
      if (v_streak ->> 'current_daily')::int >= m.days then
        if public.award_xp(p_user, 'streak:' || m.days, 'streak_milestone', m.reward) then v_changed := true; end if;
      end if;
    end loop;

    exit when not v_changed or v_pass >= 4;
  end loop;

  perform public.recompute_stats(p_user, v_today);
end $$;

create or replace function public.progress_for(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_xp', coalesce((select sum(amount) from public.xp_transactions where user_id = p_user), 0),
    'streaks', public.streak_info(p_user),
    'achievements_unlocked', (select count(*) from public.user_achievements where user_id = p_user),
    'achievements_total', (select count(*) from public.achievements),
    'completed_total', (select count(*) from public.activity_instances where user_id = p_user and status = 'completed'),
    'completed_by_area', coalesce((select jsonb_object_agg(s.code, s.c) from (
        select la.code, count(*) as c from public.activity_instances i
          join public.life_areas la on la.id = i.life_area_id
         where i.user_id = p_user and i.status = 'completed' group by la.code) s), '{}'::jsonb));
$$;

create or replace function public.complete_instance(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.activity_instances;
  v_amount integer; v_new boolean := false; v_awarded boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into i from public.activity_instances where id = p_id and user_id = v_uid and not is_hidden for update;
  if not found then raise exception 'aktivitas tidak ditemukan'; end if;

  if i.status <> 'completed' then
    perform set_config('nexora.rpc', 'on', true);
    update public.activity_instances set status = 'completed', completed_at = now() where id = p_id;
    perform set_config('nexora.rpc', 'off', true);
    v_new := true;
  end if;

  v_amount := public.xp_for_difficulty(i.difficulty);
  v_awarded := public.award_xp(v_uid, 'instance:' || p_id, 'activity_complete', v_amount, p_id);
  perform public.recompute_stats(v_uid, i.scheduled_date);
  perform public.refresh_progress(v_uid);

  return jsonb_build_object(
    'instance_id', p_id,
    'already_completed', not v_new,
    'xp_awarded', case when v_awarded then v_amount else 0 end,
    'progress', public.progress_for(v_uid));
end $$;

create or replace function public.get_progress()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return public.progress_for(auth.uid());
end $$;

create or replace function public.get_attributes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(jsonb_object_agg(attr, xp), '{}'::jsonb) into r from (
    select la.attribute as attr, sum(x.amount)::int as xp
      from public.xp_transactions x
      join public.activity_instances i on i.id = x.instance_id
      join public.life_areas la on la.id = i.life_area_id
     where x.user_id = v_uid and x.reason = 'activity_complete'
     group by la.attribute) s;
  return r;
end $$;

-- ---------------------------------------------------------------- versi jadwal
create or replace function public.save_schedule_version(p_name text, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_snap jsonb; v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', t.title, 'description', t.description, 'life_area_id', t.life_area_id,
           'difficulty', t.difficulty, 'start_time', t.start_time, 'end_time', t.end_time,
           'recurrence_type', t.recurrence_type, 'recurrence_days', t.recurrence_days,
           'day_of_month', t.day_of_month,
           'alarm', case when a.id is null then null else jsonb_build_object(
              'offset_minutes', a.offset_minutes, 'sound_type', a.sound_type, 'sound_path', a.sound_path,
              'snooze_minutes', a.snooze_minutes, 'enabled', a.enabled) end)), '[]'::jsonb)
    into v_snap
    from public.activity_templates t
    left join public.alarms a on a.template_id = t.id
   where t.user_id = v_uid and t.is_active and t.recurrence_type <> 'none';
  insert into public.schedules (user_id, name, note, snapshot) values (v_uid, p_name, coalesce(p_note, ''), v_snap)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.apply_schedule_version(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_today date; s public.schedules; r record; v_new uuid; v_n integer := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.schedules where id = p_id and user_id = v_uid;
  if not found then raise exception 'versi jadwal tidak ditemukan'; end if;
  v_today := public.user_today(v_uid);

  -- hentikan rutinitas berulang yang aktif (riwayat tetap)
  for r in select id from public.activity_templates
            where user_id = v_uid and is_active and recurrence_type <> 'none' loop
    perform public.stop_template(r.id);
  end loop;

  for r in select * from jsonb_array_elements(s.snapshot) as e(item) loop
    insert into public.activity_templates
      (user_id, title, description, life_area_id, difficulty, start_time, end_time,
       recurrence_type, recurrence_days, day_of_month, start_date)
    values (v_uid, r.item ->> 'title', coalesce(r.item ->> 'description', ''),
            (r.item ->> 'life_area_id')::smallint, r.item ->> 'difficulty',
            (r.item ->> 'start_time')::time, (r.item ->> 'end_time')::time,
            r.item ->> 'recurrence_type',
            coalesce(array(select jsonb_array_elements_text(r.item -> 'recurrence_days'))::smallint[], '{}'),
            (r.item ->> 'day_of_month')::smallint, v_today)
    returning id into v_new;
    if r.item -> 'alarm' is not null and jsonb_typeof(r.item -> 'alarm') = 'object' then
      insert into public.alarms (user_id, template_id, offset_minutes, sound_type, sound_path, snooze_minutes, enabled)
      values (v_uid, v_new, coalesce((r.item -> 'alarm' ->> 'offset_minutes')::smallint, 0),
              coalesce(r.item -> 'alarm' ->> 'sound_type', 'default'), r.item -> 'alarm' ->> 'sound_path',
              coalesce((r.item -> 'alarm' ->> 'snooze_minutes')::smallint, 5),
              coalesce((r.item -> 'alarm' ->> 'enabled')::boolean, true));
    end if;
    v_n := v_n + 1;
  end loop;

  perform public.generate_instances_for(v_uid, v_today, v_today + 60);
  update public.schedules set last_applied_at = now() where id = p_id;
  return v_n;
end $$;

-- ---------------------------------------------------------------- backup & restore
create or replace function public._with_uid(p_arr jsonb, p_uid uuid)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(e || jsonb_build_object('user_id', p_uid)), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e;
$$;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'app', 'nexora', 'version', 1, 'exported_at', now(),
    'profile',   (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'settings',  (select to_jsonb(s) from public.user_settings s where s.user_id = v_uid),
    'layout',    (select to_jsonb(l) from public.dashboard_layouts l where l.user_id = v_uid),
    'templates', coalesce((select jsonb_agg(to_jsonb(t)) from public.activity_templates t where t.user_id = v_uid), '[]'),
    'instances', coalesce((select jsonb_agg(to_jsonb(i)) from public.activity_instances i where i.user_id = v_uid), '[]'),
    'alarms',    coalesce((select jsonb_agg(to_jsonb(a)) from public.alarms a where a.user_id = v_uid), '[]'),
    'rest_days', coalesce((select jsonb_agg(to_jsonb(r)) from public.rest_days r where r.user_id = v_uid), '[]'),
    'schedules', coalesce((select jsonb_agg(to_jsonb(s)) from public.schedules s where s.user_id = v_uid), '[]'),
    'personal_quests', coalesce((select jsonb_agg(to_jsonb(q)) from public.quests q where q.user_id = v_uid), '[]'),
    'xp_total',  coalesce((select sum(amount) from public.xp_transactions where user_id = v_uid), 0));
end $$;

-- XP TIDAK diimpor dari file backup (agar tidak bisa dipalsukan): ledger dibangun ulang dari instance selesai.
create or replace function public.restore_my_data(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p is null or p ->> 'app' <> 'nexora' or (p ->> 'version')::int <> 1 then
    raise exception 'file backup tidak valid';
  end if;

  perform set_config('nexora.rpc', 'on', true);

  delete from public.xp_transactions where user_id = v_uid;
  delete from public.user_quests where user_id = v_uid;
  delete from public.user_achievements where user_id = v_uid;
  delete from public.daily_statistics where user_id = v_uid;
  delete from public.activity_instances where user_id = v_uid;
  delete from public.alarms where user_id = v_uid;
  delete from public.activity_templates where user_id = v_uid;
  delete from public.rest_days where user_id = v_uid;
  delete from public.schedules where user_id = v_uid;
  delete from public.quests where user_id = v_uid;

  insert into public.activity_templates
    select * from jsonb_populate_recordset(null::public.activity_templates, public._with_uid(p -> 'templates', v_uid));
  insert into public.alarms
    select * from jsonb_populate_recordset(null::public.alarms, public._with_uid(p -> 'alarms', v_uid));
  insert into public.activity_instances
    select * from jsonb_populate_recordset(null::public.activity_instances, public._with_uid(p -> 'instances', v_uid));
  insert into public.rest_days
    select * from jsonb_populate_recordset(null::public.rest_days, public._with_uid(p -> 'rest_days', v_uid));
  insert into public.schedules
    select * from jsonb_populate_recordset(null::public.schedules, public._with_uid(p -> 'schedules', v_uid));
  insert into public.quests
    select * from jsonb_populate_recordset(null::public.quests, public._with_uid(p -> 'personal_quests', v_uid));

  perform set_config('nexora.rpc', 'off', true);

  -- bangun ulang ledger XP dari aktivitas selesai
  insert into public.xp_transactions (user_id, instance_id, ref_key, reason, amount, created_at)
  select i.user_id, i.id, 'instance:' || i.id, 'activity_complete', public.xp_for_difficulty(i.difficulty), i.completed_at
    from public.activity_instances i
   where i.user_id = v_uid and i.status = 'completed'
  on conflict (user_id, ref_key) do nothing;
  get diagnostics v_n = row_count;

  perform public.refresh_progress(v_uid);
  perform public.recompute_stats(v_uid, d::date)
     from (select distinct scheduled_date as d from public.activity_instances where user_id = v_uid) s;

  return jsonb_build_object('restored_xp_entries', v_n,
    'templates', jsonb_array_length(coalesce(p -> 'templates', '[]')),
    'instances', jsonb_array_length(coalesce(p -> 'instances', '[]')));
end $$;

-- ---------------------------------------------------------------- undangan
create or replace function public.create_invitation(p_max_uses integer default 1, p_valid_days integer default 7, p_note text default '')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  insert into public.invitations (code_hash, note, expires_at, max_uses)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), coalesce(p_note, ''),
          now() + make_interval(days => p_valid_days), p_max_uses);
  return v_code;   -- tampil sekali; yang tersimpan hanya hash-nya
end $$;

create or replace function public.consume_invitation(p_code text, p_ip text default 'unknown')
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_n integer;
begin
  select count(*) into v_n from public.invite_attempts where ip = p_ip and created_at > now() - interval '15 minutes';
  if v_n >= 10 then raise exception 'terlalu banyak percobaan, coba lagi nanti' using errcode = '54000'; end if;
  insert into public.invite_attempts (ip) values (p_ip);
  delete from public.invite_attempts where created_at < now() - interval '1 day';

  v_hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  update public.invitations
     set used_count = used_count + 1
   where code_hash = v_hash and not revoked and expires_at > now() and used_count < max_uses;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

create or replace function public.refund_invitation(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.invitations set used_count = greatest(used_count - 1, 0)
   where code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
end $$;

-- ---------------------------------------------------------------- pengingat push
create or replace function public.due_reminders(p_now timestamptz, p_window_minutes integer default 2)
returns table (instance_id uuid, user_id uuid, title text, start_time time, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select i.id, i.user_id, i.title, i.start_time, s.endpoint, s.p256dh, s.auth
    from public.activity_instances i
    join public.alarms a on a.template_id = i.template_id and a.enabled
    join public.profiles p on p.id = i.user_id
    join public.user_settings us on us.user_id = i.user_id and us.notify_push
    join public.push_subscriptions s on s.user_id = i.user_id
   where i.status = 'planned' and not i.is_hidden and i.reminder_sent_at is null and i.start_time is not null
     and ((i.scheduled_date + i.start_time) - make_interval(mins => a.offset_minutes)) at time zone p.timezone
         between p_now - make_interval(mins => p_window_minutes) and p_now;
$$;

create or replace function public.mark_reminders_sent(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.activity_instances set reminder_sent_at = now() where id = any (p_ids);
$$;

-- ---------------------------------------------------------------- user baru
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tz text := coalesce(new.raw_user_meta_data ->> 'timezone', 'Asia/Jakarta');
begin
  if not public.is_valid_timezone(v_tz) then v_tz := 'Asia/Jakarta'; end if;
  insert into public.profiles (id, display_name, timezone)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), v_tz);
  insert into public.user_settings (user_id) values (new.id);
  insert into public.dashboard_layouts (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- hak eksekusi fungsi
-- Fungsi internal & admin: hanya service_role / postgres
revoke all on function public.generate_instances_for(uuid, date, date) from public, anon, authenticated;
revoke all on function public.mark_missed_for(uuid)                    from public, anon, authenticated;
revoke all on function public.generate_all_instances()                 from public, anon, authenticated;
revoke all on function public.recompute_stats(uuid, date)              from public, anon, authenticated;
revoke all on function public.refresh_progress(uuid)                   from public, anon, authenticated;
revoke all on function public.progress_for(uuid)                       from public, anon, authenticated;
revoke all on function public.streak_info(uuid)                        from public, anon, authenticated;
revoke all on function public.quest_progress(uuid, public.quests, date, date) from public, anon, authenticated;
revoke all on function public.award_xp(uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.user_tz(uuid)                            from public, anon, authenticated;
revoke all on function public.user_today(uuid)                         from public, anon, authenticated;
revoke all on function public.create_invitation(integer, integer, text) from public, anon, authenticated;
revoke all on function public.consume_invitation(text, text)           from public, anon, authenticated;
revoke all on function public.refund_invitation(text)                  from public, anon, authenticated;
revoke all on function public.due_reminders(timestamptz, integer)      from public, anon, authenticated;
revoke all on function public.mark_reminders_sent(uuid[])              from public, anon, authenticated;
revoke all on function public._with_uid(jsonb, uuid)                   from public, anon, authenticated;
grant execute on function public.consume_invitation(text, text)        to service_role;
grant execute on function public.refund_invitation(text)               to service_role;
grant execute on function public.due_reminders(timestamptz, integer)   to service_role;
grant execute on function public.mark_reminders_sent(uuid[])           to service_role;
grant execute on function public.generate_all_instances()              to service_role;

-- Fungsi untuk klien (JWT user): anon tidak boleh
revoke all on function public.sync_schedule(integer)                   from public, anon;
revoke all on function public.refresh_template_instances(uuid)        from public, anon;
revoke all on function public.stop_template(uuid)                      from public, anon;
revoke all on function public.delete_template(uuid)                    from public, anon;
revoke all on function public.skip_instance(uuid)                      from public, anon;
revoke all on function public.reschedule_instance(uuid, date, time, time) from public, anon;
revoke all on function public.delete_instance(uuid)                    from public, anon;
revoke all on function public.complete_instance(uuid)                  from public, anon;
revoke all on function public.get_progress()                           from public, anon;
revoke all on function public.get_attributes()                         from public, anon;
revoke all on function public.save_schedule_version(text, text)        from public, anon;
revoke all on function public.apply_schedule_version(uuid)             from public, anon;
revoke all on function public.export_my_data()                         from public, anon;
revoke all on function public.restore_my_data(jsonb)                   from public, anon;
grant execute on function public.sync_schedule(integer)                to authenticated;
grant execute on function public.refresh_template_instances(uuid)     to authenticated;
grant execute on function public.stop_template(uuid)                   to authenticated;
grant execute on function public.delete_template(uuid)                 to authenticated;
grant execute on function public.skip_instance(uuid)                   to authenticated;
grant execute on function public.reschedule_instance(uuid, date, time, time) to authenticated;
grant execute on function public.delete_instance(uuid)                 to authenticated;
grant execute on function public.complete_instance(uuid)               to authenticated;
grant execute on function public.get_progress()                        to authenticated;
grant execute on function public.get_attributes()                      to authenticated;
grant execute on function public.save_schedule_version(text, text)     to authenticated;
grant execute on function public.apply_schedule_version(uuid)          to authenticated;
grant execute on function public.export_my_data()                      to authenticated;
grant execute on function public.restore_my_data(jsonb)                to authenticated;
