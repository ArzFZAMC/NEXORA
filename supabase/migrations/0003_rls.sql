-- NEXORA — 0003: Row Level Security, storage, realtime
-- Prinsip: user hanya melihat/menulis data miliknya. Perubahan yang memengaruhi XP hanya lewat fungsi (RPC).

alter table public.life_areas         enable row level security;
alter table public.profiles           enable row level security;
alter table public.user_settings      enable row level security;
alter table public.dashboard_layouts  enable row level security;
alter table public.activity_templates enable row level security;
alter table public.activity_instances enable row level security;
alter table public.alarms             enable row level security;
alter table public.schedules          enable row level security;
alter table public.rest_days          enable row level security;
alter table public.xp_transactions    enable row level security;
alter table public.achievements       enable row level security;
alter table public.user_achievements  enable row level security;
alter table public.quests             enable row level security;
alter table public.user_quests        enable row level security;
alter table public.daily_statistics   enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.invitations        enable row level security;   -- tanpa policy = tertutup untuk semua user
alter table public.invite_attempts    enable row level security;   -- idem

-- invitations & invite_attempts: cabut semua akses dari role klien
revoke all on public.invitations     from anon, authenticated;
revoke all on public.invite_attempts from anon, authenticated;

-- Data referensi: baca saja
create policy life_areas_read   on public.life_areas   for select to authenticated using (true);
create policy achievements_read on public.achievements for select to authenticated using (true);

-- profiles (dibuat oleh trigger; user hanya boleh baca & ubah miliknya)
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy settings_select on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy settings_insert on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy settings_update on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy layouts_select on public.dashboard_layouts for select to authenticated using (user_id = auth.uid());
create policy layouts_insert on public.dashboard_layouts for insert to authenticated with check (user_id = auth.uid());
create policy layouts_update on public.dashboard_layouts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- templates
create policy templates_select on public.activity_templates for select to authenticated using (user_id = auth.uid());
create policy templates_insert on public.activity_templates for insert to authenticated with check (user_id = auth.uid());
create policy templates_update on public.activity_templates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- hapus lewat delete_template() agar riwayat terjaga

-- instances: tidak ada policy DELETE (hapus lewat delete_instance(); selesai lewat complete_instance())
create policy instances_select on public.activity_instances for select to authenticated using (user_id = auth.uid());
create policy instances_insert on public.activity_instances for insert to authenticated
  with check (user_id = auth.uid()
              and (template_id is null or exists (
                    select 1 from public.activity_templates t where t.id = template_id and t.user_id = auth.uid())));
create policy instances_update on public.activity_instances for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (template_id is null or exists (
                    select 1 from public.activity_templates t where t.id = template_id and t.user_id = auth.uid())));

create policy alarms_select on public.alarms for select to authenticated using (user_id = auth.uid());
create policy alarms_insert on public.alarms for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.activity_templates t where t.id = template_id and t.user_id = auth.uid()));
create policy alarms_update on public.alarms for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.activity_templates t where t.id = template_id and t.user_id = auth.uid()));
create policy alarms_delete on public.alarms for delete to authenticated using (user_id = auth.uid());

create policy schedules_select on public.schedules for select to authenticated using (user_id = auth.uid());
create policy schedules_delete on public.schedules for delete to authenticated using (user_id = auth.uid());

create policy rest_days_select on public.rest_days for select to authenticated using (user_id = auth.uid());
create policy rest_days_insert on public.rest_days for insert to authenticated with check (user_id = auth.uid());
create policy rest_days_delete on public.rest_days for delete to authenticated using (user_id = auth.uid());

-- Hanya-baca untuk data gamifikasi (ditulis oleh fungsi)
create policy xp_select      on public.xp_transactions   for select to authenticated using (user_id = auth.uid());
create policy userach_select on public.user_achievements for select to authenticated using (user_id = auth.uid());
create policy userq_select   on public.user_quests       for select to authenticated using (user_id = auth.uid());
create policy stats_select   on public.daily_statistics  for select to authenticated using (user_id = auth.uid());

-- Quest: bawaan (user_id null) terlihat semua; quest pribadi hanya milik sendiri
create policy quests_select on public.quests for select to authenticated using (user_id is null or user_id = auth.uid());
create policy quests_insert on public.quests for insert to authenticated with check (user_id = auth.uid());
create policy quests_update on public.quests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quests_delete on public.quests for delete to authenticated using (user_id = auth.uid());

create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Hak tabel: cabut tulis langsung pada tabel yang hanya boleh diubah fungsi
revoke insert, update, delete on public.xp_transactions, public.user_achievements,
  public.user_quests, public.daily_statistics, public.life_areas, public.achievements
  from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke insert, update on public.schedules from anon, authenticated;   -- dibuat via save_schedule_version()
revoke delete on public.activity_templates, public.activity_instances from anon, authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- storage: audio alarm (privat per user)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alarm-sounds', 'alarm-sounds', false, 2097152,
        array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/aac'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types, public = false;

create policy "alarm sounds: read own" on storage.objects for select to authenticated
  using (bucket_id = 'alarm-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "alarm sounds: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'alarm-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "alarm sounds: update own" on storage.objects for update to authenticated
  using (bucket_id = 'alarm-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "alarm sounds: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'alarm-sounds' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- realtime (sinkronisasi lintas perangkat)
do $$
begin
  alter publication supabase_realtime add table public.activity_instances;
  alter publication supabase_realtime add table public.xp_transactions;
exception when others then
  raise notice 'realtime publication tidak diubah: %', sqlerrm;
end $$;
