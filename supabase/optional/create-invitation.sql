-- Membuat kode undangan. Jalankan di Supabase Dashboard > SQL Editor (berjalan sebagai postgres).
-- Argumen: jumlah pemakaian maksimum, masa berlaku (hari), catatan.
-- Kode ASLI hanya tampil satu kali di hasil query ini; database hanya menyimpan hash-nya.

select public.create_invitation(1, 7, 'untuk saya');

-- Melihat status undangan (tanpa kode asli):
-- select id, note, expires_at, max_uses, used_count, revoked from public.invitations order by created_at desc;

-- Mencabut undangan:
-- update public.invitations set revoked = true where id = '<id>';
