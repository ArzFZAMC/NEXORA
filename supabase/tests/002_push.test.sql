-- pgTAP untuk Background Push (migrasi 0006). Jalankan: `supabase test db` (butuh Supabase CLI + Docker).
-- CATATAN: berkas ini ditulis tetapi BELUM dijalankan terhadap Postgres sungguhan di lingkungan pengembangan.
begin;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data, instance_id, aud, role)
values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'pa@test.dev', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('bbbbbbbb-0000-4000-8000-0000000000b2', 'pb@test.dev', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- fixture pengingat user A: 10 Mar 2030 08:00 WIB, alarm 5 menit sebelumnya => fire_at 00:55 UTC
update public.profiles set timezone = 'Asia/Jakarta' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
update public.user_settings set notify_push = true where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
insert into public.activity_templates (id, user_id, title, life_area_id, start_time, end_time, start_date)
values ('cccccccc-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Olahraga pagi',
        (select min(id) from public.life_areas), '08:00', '09:00', '2030-03-10');
insert into public.alarms (user_id, template_id, offset_minutes)
values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'cccccccc-0000-4000-8000-0000000000c1', 5);
insert into public.activity_instances (id, user_id, template_id, scheduled_date, title, life_area_id, start_time, end_time)
values ('dddddddd-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'cccccccc-0000-4000-8000-0000000000c1',
        '2030-03-10', 'Olahraga pagi', (select min(id) from public.life_areas), '08:00', '09:00');

-- ---- sebagai user A
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select ok(public.register_push_subscription('https://push.example.com/a-1', repeat('p', 87), repeat('a', 22), 'UA', 'HP') is not null,
          'user A dapat mendaftarkan langganan lewat RPC');
select throws_ok($$ select public.register_push_subscription('http://insecure.example.com/x', repeat('p', 87), repeat('a', 22)) $$,
                 null, null, 'endpoint non-https ditolak');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'https://x.example.com/z', 'k', 'a') $$,
                 '42501', null, 'INSERT langsung ke push_subscriptions ditolak (hanya lewat RPC)');
select is((select count(*)::int from public.push_subscriptions), 1, 'user A melihat langganannya sendiri');
select throws_ok($$ select * from public.claim_due_reminders() $$, '42501', null, 'authenticated tidak boleh memanggil claim_due_reminders');
select throws_ok($$ select public.complete_push_delivery(1, 'sent') $$, '42501', null, 'authenticated tidak boleh memanggil complete_push_delivery');
select throws_ok($$ select * from public.prepare_test_push('aaaaaaaa-0000-4000-8000-0000000000a1') $$, '42501', null, 'authenticated tidak boleh memanggil prepare_test_push');

-- ---- sebagai user B: isolasi
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000b2', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from public.push_subscriptions), 0, 'RLS: user B tidak melihat langganan user A');
select is((select count(*)::int from public.push_deliveries), 0, 'RLS: user B tidak melihat log pengiriman user A');

-- ---- sebagai service_role (backend): klaim, idempotensi, penyelesaian
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_due_reminders('2030-03-10 00:54:00+00')), 0, 'belum jatuh tempo (00:54 UTC) => tidak ada klaim');
select is((select count(*)::int from public.claim_due_reminders('2030-03-10 00:57:00+00')), 1, 'jatuh tempo menurut zona waktu user (WIB) => 1 klaim');
select is((select count(*)::int from public.claim_due_reminders('2030-03-10 00:58:00+00')), 0, 'klaim ulang segera => tidak ada duplikat');
select is((select count(*)::int from public.push_deliveries where kind = 'reminder'), 1, 'hanya satu baris pengiriman per (instance, perangkat, fire_at)');
select is((select count(*)::int from public.claim_due_reminders('2030-03-10 01:30:00+00')), 0, 'lewat batas toleransi 10 menit => dilewati (basi)');

select public.complete_push_delivery((select id from public.push_deliveries where kind = 'reminder'), 'expired', 410, 'gone');
select is((select is_active from public.push_subscriptions where endpoint = 'https://push.example.com/a-1'), false,
          'respons 410 menonaktifkan langganan');

select * from finish();
rollback;
