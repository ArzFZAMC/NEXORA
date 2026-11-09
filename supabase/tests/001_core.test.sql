-- pgTAP: jalankan dengan `supabase test db` (butuh Supabase CLI + Docker).
-- Mencakup: RLS isolasi, duplikat instance, integritas XP, riwayat vs edit template, invitation.
begin;
select plan(21);

-- ---- fixture: dua user
insert into auth.users (id, email, raw_user_meta_data, instance_id, aud, role)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.dev', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.dev', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

select is((select count(*)::int from public.profiles where id in
  ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002')), 2,
  'trigger membuat profil untuk user baru');

-- ---- bertindak sebagai user A
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- zona waktu UTC agar "hari ini" sama dengan current_date di server tes (hindari beda tanggal WIB/UTC)
update public.profiles set timezone = 'UTC' where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.activity_templates (id, user_id, title, life_area_id, difficulty, recurrence_type, start_date, start_time)
values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Belajar IT Support', 2, 'normal', 'daily', current_date, '20:30');

select ok((select (public.sync_schedule(7) ->> 'created')::int) >= 7, 'sync_schedule membuat instance harian');
select is((select public.sync_schedule(7) ->> 'created')::int, 0, 'sync_schedule kedua kali tidak membuat duplikat');
select is((select count(*)::int from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date), 1,
          'hanya satu instance per template per tanggal');

-- duplikat langsung ditolak constraint
select throws_ok($$
  insert into public.activity_instances (user_id, template_id, scheduled_date, title, life_area_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', current_date, 'dup', 2)
$$, '23505', null, 'insert duplikat ditolak unique index');

-- ---- XP
select throws_ok($$
  update public.activity_instances set status = 'completed', completed_at = now()
   where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date
$$, 'P0001', null, 'status completed tidak bisa diubah langsung (harus lewat complete_instance)');

select is((select (public.complete_instance(id) ->> 'xp_awarded')::int from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date), 20,
          'complete_instance memberi 20 XP (normal)');
select is((select (public.complete_instance(id) ->> 'xp_awarded')::int from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date), 0,
          'complete kedua kali tidak memberi XP lagi');
select is((select count(*)::int from public.xp_transactions where reason = 'activity_complete'), 1,
          'ledger hanya punya satu transaksi activity_complete');

select throws_ok($$ insert into public.xp_transactions (user_id, ref_key, reason, amount)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'achievement', 999) $$,
  '42501', null, 'user tidak bisa menulis ledger XP langsung');

select throws_ok($$
  update public.activity_instances set status = 'planned', completed_at = null
   where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date
$$, 'P0001', null, 'aktivitas selesai tidak bisa kembali ke planned');

-- ---- riwayat tidak berubah saat template diedit
update public.activity_templates set title = 'Judul Baru' where id = '11111111-0000-4000-8000-000000000001';
select public.refresh_template_instances('11111111-0000-4000-8000-000000000001');
select is((select title from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date),
          'Belajar IT Support', 'instance yang sudah selesai tidak berubah setelah template diedit');
select is((select title from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and scheduled_date = current_date + 2),
          'Judul Baru', 'instance mendatang mengikuti template baru');

-- ---- menghentikan pengulangan tidak menghapus riwayat
select public.stop_template('11111111-0000-4000-8000-000000000001');
select is((select count(*)::int from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and status = 'completed'), 1,
          'riwayat selesai tetap ada setelah stop_template');
select is((select count(*)::int from public.activity_instances
            where template_id = '11111111-0000-4000-8000-000000000001' and status = 'planned'
              and scheduled_date > current_date), 0, 'jadwal mendatang dibersihkan setelah stop');

-- ---- menghapus template tidak menghapus riwayat
select public.delete_template('11111111-0000-4000-8000-000000000001');
select is((select count(*)::int from public.activity_instances where status = 'completed'), 1,
          'riwayat selesai tetap ada setelah template dihapus');

-- ---- RLS: user B tidak melihat data A
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.activity_instances), 0, 'RLS: user B tidak melihat instance user A');
select is((select count(*)::int from public.xp_transactions), 0, 'RLS: user B tidak melihat XP user A');
select is((select count(*)::int from public.activity_templates), 0, 'RLS: user B tidak melihat template user A');
select throws_ok($$ select * from public.invitations $$, '42501', null, 'invitations tidak bisa dibaca user');

-- ---- invitation (service role / postgres)
reset role;
select public.create_invitation(1, 7, 'tes');
select ok((select public.consume_invitation(
  (select code from (select upper(encode(extensions.gen_random_bytes(6),'hex')) as code) x), 'ip-test')) = false,
  'kode acak ditolak');

select * from finish();
rollback;
