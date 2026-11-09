-- NEXORA — 0005: hak akses tabel untuk Data API
-- Supabase tidak lagi otomatis membuka tabel baru di schema `public` ke API (butuh GRANT eksplisit).
-- Tanpa ini, aplikasi menampilkan "Kamu tidak memiliki izin untuk aksi ini" (error 42501).
-- Aman dijalankan berulang. Jalankan SETELAH 0001–0004. RLS tetap membatasi baris per pengguna.

grant usage on schema public to anon, authenticated, service_role;

-- ---- authenticated: hanya hak yang dibutuhkan (sejalan dengan policy RLS di 0003)
grant select on
  public.life_areas, public.achievements, public.profiles, public.user_settings, public.dashboard_layouts,
  public.activity_templates, public.activity_instances, public.alarms, public.schedules, public.rest_days,
  public.xp_transactions, public.user_achievements, public.quests, public.user_quests,
  public.daily_statistics, public.push_subscriptions
  to authenticated;

grant insert on
  public.user_settings, public.dashboard_layouts, public.activity_templates, public.activity_instances,
  public.alarms, public.rest_days, public.quests, public.push_subscriptions
  to authenticated;

grant update on
  public.profiles, public.user_settings, public.dashboard_layouts, public.activity_templates,
  public.activity_instances, public.alarms, public.quests, public.push_subscriptions
  to authenticated;

grant delete on
  public.alarms, public.schedules, public.rest_days, public.quests, public.push_subscriptions
  to authenticated;

-- upsert langganan push dengan endpoint yang sama
drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- service_role (Edge Functions): akses penuh
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- invitations & invite_attempts tetap TERTUTUP untuk anon/authenticated (tidak di-GRANT di atas)