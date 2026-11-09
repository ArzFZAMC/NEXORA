-- NEXORA — 0004: data referensi (life areas, achievements, quest bawaan)

insert into public.life_areas (id, code, name, attribute, sort_order) values
  (1, 'spiritual',     'Spiritual',     'spiritual', 1),
  (2, 'learning',      'Learning',      'knowledge', 2),
  (3, 'career',        'Career',        'career',    3),
  (4, 'health',        'Health',        'health',    4),
  (5, 'personal',      'Personal',      'personal',  5),
  (6, 'entertainment', 'Entertainment', 'creativity',6)
on conflict (id) do update set name = excluded.name, attribute = excluded.attribute, sort_order = excluded.sort_order;

insert into public.achievements (id, code, name, description, kind, threshold, area_code, xp_reward, sort_order) values
  (1,  'first_step',   'Langkah Pertama',   'Selesaikan 1 aktivitas',        'total_completed', 1,    null, 10,  1),
  (2,  'ten_done',     'Mulai Terbiasa',    'Selesaikan 10 aktivitas',       'total_completed', 10,   null, 25,  2),
  (3,  'fifty_done',   'Konsisten',         'Selesaikan 50 aktivitas',       'total_completed', 50,   null, 75,  3),
  (4,  'hundred_done', 'Seratus Langkah',   'Selesaikan 100 aktivitas',      'total_completed', 100,  null, 150, 4),
  (5,  'five_hundred', 'Tak Terhentikan',   'Selesaikan 500 aktivitas',      'total_completed', 500,  null, 500, 5),
  (6,  'streak_3',     'Tiga Hari Beruntun','Streak harian 3 hari',          'streak',          3,    null, 20,  6),
  (7,  'streak_7',     'Seminggu Penuh',    'Streak harian 7 hari',          'streak',          7,    null, 50,  7),
  (8,  'streak_30',    'Sebulan Berjalan',  'Streak harian 30 hari',         'streak',          30,   null, 200, 8),
  (9,  'level_5',      'Naik Level 5',      'Capai level 5',                 'level',           5,    null, 50,  9),
  (10, 'level_10',     'Naik Level 10',     'Capai level 10',                'level',           10,   null, 100, 10),
  (11, 'learn_20',     'Pembelajar',        'Selesaikan 20 aktivitas Learning','area_completed',20,   'learning',   50, 11),
  (12, 'spirit_20',    'Teguh Beribadah',   'Selesaikan 20 aktivitas Spiritual','area_completed',20,  'spiritual',  50, 12),
  (13, 'health_20',    'Tubuh Sehat',       'Selesaikan 20 aktivitas Health','area_completed',  20,   'health',     50, 13),
  (14, 'career_20',    'Pejuang Karier',    'Selesaikan 20 aktivitas Career','area_completed',  20,   'career',     50, 14),
  (15, 'xp_1000',      '1.000 XP',          'Kumpulkan 1.000 XP',            'xp_total',        1000, null, 100, 15)
on conflict (id) do update set name = excluded.name, description = excluded.description,
  kind = excluded.kind, threshold = excluded.threshold, area_code = excluded.area_code, xp_reward = excluded.xp_reward;

-- Quest bawaan (user_id null). Id tetap agar seed idempoten.
insert into public.quests (id, user_id, title, description, period, kind, area_code, target, xp_reward) values
  ('00000000-0000-4000-8000-000000000001', null, 'Tiga langkah hari ini',  'Selesaikan 3 aktivitas hari ini',        'daily',   'complete_any',  null,        3,  15),
  ('00000000-0000-4000-8000-000000000002', null, 'Rawat diri',             'Selesaikan 1 aktivitas Health hari ini', 'daily',   'complete_area', 'health',    1,  10),
  ('00000000-0000-4000-8000-000000000003', null, 'Tambah ilmu',            'Selesaikan 1 aktivitas Learning hari ini','daily',  'complete_area', 'learning',  1,  10),
  ('00000000-0000-4000-8000-000000000004', null, 'Lima hari aktif',        'Aktif di 5 hari berbeda minggu ini',      'weekly',  'active_days',   null,        5,  60),
  ('00000000-0000-4000-8000-000000000005', null, 'Lima belas aktivitas',   'Selesaikan 15 aktivitas minggu ini',      'weekly',  'complete_any',  null,        15, 75),
  ('00000000-0000-4000-8000-000000000006', null, 'Sepuluh hari aktif',     'Aktif di 10 hari berbeda bulan ini',      'monthly', 'active_days',   null,        10, 150),
  ('00000000-0000-4000-8000-000000000007', null, 'Enam puluh aktivitas',   'Selesaikan 60 aktivitas bulan ini',       'monthly', 'complete_any',  null,        60, 250)
on conflict (id) do update set title = excluded.title, description = excluded.description,
  target = excluded.target, xp_reward = excluded.xp_reward;
