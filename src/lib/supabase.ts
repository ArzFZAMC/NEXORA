import { createClient } from '@supabase/supabase-js';

// Merapikan URL dari .env: buang spasi, garis miring di akhir, dan path ekstra (mis. "/rest/v1")
function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try { return new URL(raw.trim()).origin; } catch { return raw.trim(); }
}
const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isConfigured = Boolean(url && anon && !url.includes('xxxxxxxx'));

// Hanya anon key yang dipakai di frontend. Keamanan data dijaga Row Level Security di database.
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const supabaseUrl = url ?? '';
export const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
