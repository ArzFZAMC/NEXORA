-- NEXORA — 0001: tabel, constraint, index
-- Jalankan berurutan: 0001 -> 0002 -> 0003 -> 0004

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_valid_timezone(p_tz text)
returns boolean language sql stable as $$
  select exists (select 1 from pg_timezone_names where name = p_tz);
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- reference
create table public.life_areas (
  id         smallint primary key,
  code       text not null unique,
  name       text not null,
  attribute  text not null check (attribute in ('knowledge','career','health','spiritual','personal','creativity')),
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------- user data
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  timezone     text not null default 'Asia/Jakarta' check (public.is_valid_timezone(timezone)),
  language     text not null default 'id' check (language in ('id','en')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  theme        text not null default 'dark' check (theme in ('dark','light','system')),
  accent       text not null default 'electric-blue'
               check (accent in ('electric-blue','violet','emerald','amber','rose')),
  notify_push  boolean not null default false,
  notify_sound boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table public.dashboard_layouts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  preset     text not null default 'balanced' check (preset in ('compact','balanced','focus')),
  widgets    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Activity Template: aturan + pengulangan
create table public.activity_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  description     text not null default '' check (char_length(description) <= 1000),
  life_area_id    smallint not null references public.life_areas (id),
  difficulty      text not null default 'normal' check (difficulty in ('easy','normal','hard','challenge')),
  start_time      time,
  end_time        time,
  recurrence_type text not null default 'none' check (recurrence_type in ('none','daily','weekly','monthly','custom')),
  recurrence_days smallint[] not null default '{}'
                  check (recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  day_of_month    smallint check (day_of_month between 1 and 31),
  start_date      date not null,
  end_date        date,
  is_active       boolean not null default true,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index activity_templates_user_idx on public.activity_templates (user_id, is_active);

-- Activity Instance: aktivitas pada tanggal tertentu (dengan snapshot data template)
create table public.activity_instances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  template_id      uuid references public.activity_templates (id) on delete set null,
  scheduled_date   date not null,
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  description      text not null default '' check (char_length(description) <= 1000),
  life_area_id     smallint not null references public.life_areas (id),
  difficulty       text not null default 'normal' check (difficulty in ('easy','normal','hard','challenge')),
  start_time       time,
  end_time         time,
  status           text not null default 'planned' check (status in ('planned','completed','skipped','missed')),
  completed_at     timestamptz,
  notes            text not null default '' check (char_length(notes) <= 2000),
  is_exception     boolean not null default false,  -- diubah/dipindah manual, tidak ikut perubahan template
  is_hidden        boolean not null default false,  -- "dihapus" oleh user; slot tetap terisi agar tidak dibuat ulang
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check (start_time is null or end_time is null or end_time > start_time)
);
-- Tidak boleh ada instance ganda dari template yang sama pada tanggal yang sama
create unique index activity_instances_no_dupes
  on public.activity_instances (template_id, scheduled_date)
  where template_id is not null and not is_exception;
create index activity_instances_user_date_idx   on public.activity_instances (user_id, scheduled_date);
create index activity_instances_user_status_idx on public.activity_instances (user_id, status);
create index activity_instances_template_idx    on public.activity_instances (template_id);

create table public.alarms (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  template_id    uuid not null unique references public.activity_templates (id) on delete cascade,
  offset_minutes smallint not null default 0 check (offset_minutes between 0 and 1440),
  sound_type     text not null default 'default' check (sound_type in ('default','custom')),
  sound_path     text check (sound_path is null or char_length(sound_path) <= 300),
  snooze_minutes smallint not null default 5 check (snooze_minutes between 1 and 60),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (sound_type = 'default' or sound_path is not null)
);

-- Versi jadwal tersimpan (snapshot rutinitas)
create table public.schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  note            text not null default '' check (char_length(note) <= 500),
  snapshot        jsonb not null default '[]'::jsonb check (jsonb_typeof(snapshot) = 'array'),
  last_applied_at timestamptz,
  created_at      timestamptz not null default now()
);
create index schedules_user_idx on public.schedules (user_id);

create table public.rest_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  rest_date  date not null,
  reason     text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, rest_date)
);

-- ---------------------------------------------------------------- gamification
create table public.xp_transactions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  instance_id uuid references public.activity_instances (id) on delete set null,
  ref_key     text not null,   -- 'instance:<id>' | 'quest:<id>:<period>' | 'ach:<id>' | 'streak:<n>'
  reason      text not null check (reason in ('activity_complete','quest_complete','achievement','streak_milestone')),
  amount      integer not null check (amount > 0),   -- ledger hanya menambah; tidak ada pengurangan
  created_at  timestamptz not null default now(),
  unique (user_id, ref_key)                          -- XP hanya satu kali per sumber
);
create index xp_transactions_user_idx on public.xp_transactions (user_id, created_at);

create table public.achievements (
  id          smallint primary key,
  code        text not null unique,
  name        text not null,
  description text not null,
  kind        text not null check (kind in ('total_completed','streak','level','area_completed','xp_total')),
  threshold   integer not null check (threshold > 0),
  area_code   text,
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  sort_order  smallint not null default 0
);

create table public.user_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id smallint not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.quests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,   -- null = quest bawaan sistem
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  period      text not null check (period in ('daily','weekly','monthly','personal')),
  kind        text not null default 'complete_any' check (kind in ('complete_any','complete_area','active_days')),
  area_code   text,
  target      integer not null check (target between 1 and 1000),
  xp_reward   integer not null default 0 check (xp_reward between 0 and 500),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (kind <> 'complete_area' or area_code is not null)
);
create index quests_user_idx on public.quests (user_id);

create table public.user_quests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  quest_id     uuid not null references public.quests (id) on delete cascade,
  period_start date not null,
  progress     integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  unique (user_id, quest_id, period_start)
);

create table public.daily_statistics (
  user_id      uuid not null references auth.users (id) on delete cascade,
  stat_date    date not null,
  planned      integer not null default 0,
  completed    integer not null default 0,
  skipped      integer not null default 0,
  missed       integer not null default 0,
  xp_earned    integer not null default 0,
  is_rest_day  boolean not null default false,
  by_area      jsonb not null default '{}'::jsonb,
  primary key (user_id, stat_date)
);

-- ---------------------------------------------------------------- notifikasi & undangan
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  code_hash  text not null unique,           -- sha256 dari kode; kode asli tidak disimpan
  note       text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses   integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  revoked    boolean not null default false,
  check (used_count <= max_uses)
);

create table public.invite_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index invite_attempts_ip_idx on public.invite_attempts (ip, created_at);

-- ---------------------------------------------------------------- updated_at triggers
create trigger profiles_touch   before update on public.profiles          for each row execute function public.touch_updated_at();
create trigger settings_touch   before update on public.user_settings     for each row execute function public.touch_updated_at();
create trigger layouts_touch    before update on public.dashboard_layouts for each row execute function public.touch_updated_at();
create trigger instances_touch  before update on public.activity_instances for each row execute function public.touch_updated_at();
create trigger alarms_touch     before update on public.alarms            for each row execute function public.touch_updated_at();

create or replace function public.templates_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
create trigger templates_touch before update on public.activity_templates
  for each row execute function public.templates_before_update();
