export default function Setup() {
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <div className="card max-w-lg">
        <h1 className="text-2xl font-bold">NEXORA belum dikonfigurasi</h1>
        <p className="text-sm text-muted mt-3 leading-relaxed">
          Variabel <code className="text-accent">VITE_SUPABASE_URL</code> dan <code className="text-accent">VITE_SUPABASE_ANON_KEY</code> belum diisi.
          Salin <code>.env.example</code> menjadi <code>.env.local</code>, isi nilainya dari Supabase Dashboard → Project Settings → API,
          lalu jalankan ulang <code>npm run dev</code>. Panduan lengkap ada di <code>README.md</code> bagian “Konfigurasi Supabase”.
        </p>
      </div>
    </div>
  );
}
