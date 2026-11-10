-- NEXORA — 0006: Background Push (idempotensi pengiriman, siklus hidup langganan, retry)
-- Jalankan SETELAH 0001–0005. Aman dijalankan berulang. TIDAK menghapus/mengubah data lama.
-- Fungsi lama due_reminders() & mark_reminders_sent() tetap ada (tidak lagi dipakai send-reminders versi baru).

-- ---------------------------------------------------------------- 1) push_subscriptions: kolom siklus hidup
alter table public.push_subscriptions
  add column if not exists is_active       boolean     not null default true,
  add column if not exists device_label    text        not null default '' check (char_length(device_label) <= 80),
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists last_seen_at    timestamptz not null default now(),
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error      text,
  add column if not exists failure_count   integer     not null default 0;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

-- Klien tidak lagi menulis langsung: pendaftaran lewat RPC register_push_subscription() (di bawah).
-- Klien tetap boleh MELIHAT dan MENGHAPUS langganan miliknya (policy push_select / push_delete dari 0003).
revoke insert, update on public.push_subscriptions from anon, authenticated;
drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_update on public.push_subscriptions;

-- ---------------------------------------------------------------- 2) push_deliveries: log + kunci idempotensi
create table if not exists public.push_deliveries (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  subscription_id uuid        not null references public.push_subscriptions (id) on delete cascade,
  instance_id     uuid        references public.activity_instances (id) on delete cascade,
  kind            text        not null default 'reminder' check (kind in ('reminder', 'test')),
  fire_at         timestamptz not null,                     -- waktu pengingat seharusnya berbunyi
  status          text        not null default 'pending'
                  check (status in ('pending', 'sending', 'sent', 'failed', 'expired', 'cancelled')),
  attempts        integer     not null default 0,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  http_status     integer,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((kind = 'reminder') = (instance_id is not null))
);
-- Satu pengingat (aktivitas + waktu bunyi) hanya boleh ada SATU kali per perangkat, berapa kali pun scheduler berjalan.
create unique index if not exists push_deliveries_reminder_uniq
  on public.push_deliveries (instance_id, subscription_id, fire_at) where kind = 'reminder';
create index if not exists push_deliveries_user_idx on public.push_deliveries (user_id, created_at desc);
create index if not exists push_deliveries_open_idx on public.push_deliveries (fire_at) where status in ('pending', 'sending', 'failed');
create index if not exists activity_instances_due_idx on public.activity_instances (scheduled_date)
  where status = 'planned' and not is_hidden and start_time is not null;

drop trigger if exists push_deliveries_touch on public.push_deliveries;
create trigger push_deliveries_touch before update on public.push_deliveries
  for each row execute function public.touch_updated_at();

alter table public.push_deliveries enable row level security;
drop policy if exists push_deliveries_select on public.push_deliveries;
create policy push_deliveries_select on public.push_deliveries for select to authenticated using (user_id = auth.uid());
revoke all on public.push_deliveries from anon, authenticated;
grant select on public.push_deliveries to authenticated;       -- hanya baca milik sendiri; tidak ada tulis dari klien
grant all on public.push_deliveries to service_role;
grant all on sequence public.push_deliveries_id_seq to service_role;

-- ---------------------------------------------------------------- 3) RPC pendaftaran langganan (dipanggil klien)
-- Endpoint push adalah "kunci" milik satu browser. Jika browser yang sama dipakai akun lain,
-- langganan dipindahkan ke akun yang sedang login dan pengiriman tertunda milik akun lama dibatalkan.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '', p_label text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_old uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'endpoint push tidak valid';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'kunci langganan push tidak valid';
  end if;

  select s.user_id into v_old from public.push_subscriptions s where s.endpoint = p_endpoint;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_label, is_active, last_seen_at, failure_count, last_error)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 200), left(coalesce(p_label, ''), 80), true, now(), 0, null)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent,
        device_label = case when excluded.device_label <> '' then excluded.device_label else public.push_subscriptions.device_label end,
        is_active = true, last_seen_at = now(), failure_count = 0, last_error = null
  returning id into v_id;

  if v_old is not null and v_old <> v_uid then
    update public.push_deliveries set status = 'cancelled'
     where subscription_id = v_id and status in ('pending', 'sending', 'failed');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- 4) klaim pengingat jatuh tempo (hanya service_role)
-- Atomik & aman dijalankan bersamaan: FOR UPDATE SKIP LOCKED + UNIQUE index mencegah pengiriman ganda.
-- Aturan: pengingat dikirim bila fire_at <= sekarang dan belum lewat p_grace_minutes (default 10 menit).
-- Lebih lama dari itu dianggap basi dan DILEWATI (tidak dikirim terlambat). Gagal dicoba ulang s.d. p_max_attempts.
create or replace function public.claim_due_reminders(
  p_now timestamptz default now(), p_grace_minutes integer default 10, p_limit integer default 200, p_max_attempts integer default 3)
returns table (
  delivery_id bigint, d_user_id uuid, d_instance_id uuid, d_scheduled_date date, d_title text, d_start_time time,
  d_fire_at timestamptz, d_endpoint text, d_p256dh text, d_auth text)
language plpgsql security definer set search_path = public as $$
declare v_grace interval := make_interval(mins => greatest(p_grace_minutes, 1));
begin
  -- (a) buat baris pengiriman untuk pengingat yang sudah jatuh tempo (idempoten)
  insert into public.push_deliveries (user_id, subscription_id, instance_id, kind, fire_at)
  select i.user_id, s.id, i.id, 'reminder', f.fire_at
    from public.activity_instances i
    join public.alarms a on a.template_id = i.template_id and a.enabled
    join public.profiles p on p.id = i.user_id
    join public.user_settings us on us.user_id = i.user_id and us.notify_push
    join public.push_subscriptions s on s.user_id = i.user_id and s.is_active
    cross join lateral (
      select ((i.scheduled_date + i.start_time) - make_interval(mins => a.offset_minutes)) at time zone p.timezone as fire_at
    ) f
   where i.status = 'planned' and not i.is_hidden and i.start_time is not null
     and i.scheduled_date between (p_now at time zone 'UTC')::date - 2 and (p_now at time zone 'UTC')::date + 2
     and f.fire_at <= p_now and f.fire_at > p_now - v_grace
     and not exists (select 1 from public.rest_days r where r.user_id = i.user_id and r.rest_date = i.scheduled_date)
  on conflict (instance_id, subscription_id, fire_at) where kind = 'reminder' do nothing;

  -- (b) klaim: baru, gagal (coba ulang), atau 'sending' yang macet > 3 menit
  return query
  with c as (
    select d.id
      from public.push_deliveries d
      join public.activity_instances i on i.id = d.instance_id and i.status = 'planned' and not i.is_hidden
      join public.push_subscriptions s on s.id = d.subscription_id and s.is_active
     where d.kind = 'reminder'
       and d.fire_at > p_now - v_grace
       and d.attempts < p_max_attempts
       and (d.status in ('pending', 'failed') or (d.status = 'sending' and d.claimed_at < p_now - interval '3 minutes'))
     order by d.fire_at
     limit p_limit
     for update of d skip locked
  ), u as (
    update public.push_deliveries d
       set status = 'sending', attempts = d.attempts + 1, claimed_at = p_now
      from c where d.id = c.id
    returning d.id, d.user_id, d.instance_id, d.subscription_id, d.fire_at
  )
  select u.id, u.user_id, u.instance_id, i.scheduled_date, i.title, i.start_time, u.fire_at, s.endpoint, s.p256dh, s.auth
    from u
    join public.activity_instances i on i.id = u.instance_id
    join public.push_subscriptions s on s.id = u.subscription_id;
end $$;

-- ---------------------------------------------------------------- 5) catat hasil pengiriman (hanya service_role)
create or replace function public.complete_push_delivery(
  p_id bigint, p_outcome text, p_http integer default null, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d public.push_deliveries;
begin
  if p_outcome not in ('sent', 'failed', 'expired') then raise exception 'outcome tidak valid'; end if;
  select * into d from public.push_deliveries where id = p_id for update;
  if not found then return; end if;

  update public.push_deliveries
     set status = p_outcome, http_status = p_http, error = left(p_error, 300),
         sent_at = case when p_outcome = 'sent' then now() end
   where id = p_id;

  if p_outcome = 'sent' then
    update public.push_subscriptions set last_success_at = now(), failure_count = 0, last_error = null where id = d.subscription_id;
    if d.instance_id is not null then   -- kompatibel dengan kolom lama
      update public.activity_instances set reminder_sent_at = coalesce(reminder_sent_at, now()) where id = d.instance_id;
    end if;
  elsif p_outcome = 'expired' then       -- 404/410: langganan sudah tidak berlaku
    update public.push_subscriptions set is_active = false, last_error = left(coalesce(p_error, 'expired'), 300) where id = d.subscription_id;
  else                                   -- gagal sementara; nonaktif setelah 10 kegagalan beruntun
    update public.push_subscriptions
       set failure_count = failure_count + 1, last_error = left(p_error, 300), is_active = (failure_count + 1) < 10
     where id = d.subscription_id;
  end if;
end $$;

-- ---------------------------------------------------------------- 6) notifikasi percobaan (dipanggil Edge Function send-test-push)
create or replace function public.prepare_test_push(p_user uuid)
returns table (delivery_id bigint, d_endpoint text, d_p256dh text, d_auth text)
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_deliveries x where x.user_id = p_user and x.kind = 'test' and x.created_at > now() - interval '20 seconds') then
    raise exception 'terlalu sering' using errcode = '54000';
  end if;
  return query
  with ins as (
    insert into public.push_deliveries (user_id, subscription_id, kind, fire_at, status, attempts, claimed_at)
    select s.user_id, s.id, 'test', now(), 'sending', 1, now()
      from public.push_subscriptions s where s.user_id = p_user and s.is_active
    returning id, subscription_id
  )
  select ins.id, s.endpoint, s.p256dh, s.auth from ins join public.push_subscriptions s on s.id = ins.subscription_id;
end $$;

-- ---------------------------------------------------------------- 7) pembersihan
create or replace function public.purge_push_data(p_keep_days integer default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_del integer; v_sub integer;
begin
  delete from public.push_deliveries
   where created_at < now() - make_interval(days => greatest(p_keep_days, 1)) and status in ('sent', 'failed', 'expired', 'cancelled');
  get diagnostics v_del = row_count;
  delete from public.push_subscriptions where not is_active and updated_at < now() - interval '30 days';
  get diagnostics v_sub = row_count;
  return jsonb_build_object('deliveries_deleted', v_del, 'subscriptions_deleted', v_sub);
end $$;

-- ---------------------------------------------------------------- 8) hak eksekusi
revoke all on function public.claim_due_reminders(timestamptz, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_push_delivery(bigint, text, integer, text)         from public, anon, authenticated;
revoke all on function public.prepare_test_push(uuid)                                     from public, anon, authenticated;
revoke all on function public.purge_push_data(integer)                                    from public, anon, authenticated;
revoke all on function public.register_push_subscription(text, text, text, text, text)    from public, anon;
grant execute on function public.claim_due_reminders(timestamptz, integer, integer, integer) to service_role;
grant execute on function public.complete_push_delivery(bigint, text, integer, text)         to service_role;
grant execute on function public.prepare_test_push(uuid)                                     to service_role;
grant execute on function public.purge_push_data(integer)                                    to service_role;
grant execute on function public.register_push_subscription(text, text, text, text, text)    to authenticated;
