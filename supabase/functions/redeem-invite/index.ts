// Edge Function: redeem-invite
// Satu-satunya jalan pembuatan akun (registrasi publik dimatikan). Memakai service_role HANYA di sini (server).
import { createClient } from "npm:@supabase/supabase-js@2";

const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allowed.includes("*") ? "*" : origin) : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  let payload: { code?: string; email?: string; password?: string; displayName?: string; timezone?: string };
  try { payload = await req.json(); } catch { return json(req, 400, { error: "Body tidak valid" }); }

  const code = String(payload.code ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const displayName = String(payload.displayName ?? "").trim().slice(0, 60);
  const timezone = String(payload.timezone ?? "Asia/Jakarta").slice(0, 64);

  if (!/^[A-Z0-9]{8,32}$/i.test(code)) return json(req, 400, { error: "Format kode undangan tidak valid" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(req, 400, { error: "Email tidak valid" });
  if (password.length < 8 || password.length > 72) return json(req, 400, { error: "Password harus 8–72 karakter" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const { data: ok, error: consumeErr } = await admin.rpc("consume_invitation", { p_code: code, p_ip: ip });
  if (consumeErr) {
    const tooMany = consumeErr.code === "54000";
    return json(req, tooMany ? 429 : 500, { error: tooMany ? "Terlalu banyak percobaan. Coba lagi 15 menit lagi." : "Gagal memeriksa kode" });
  }
  if (!ok) return json(req, 400, { error: "Kode undangan tidak valid, kedaluwarsa, atau sudah habis dipakai" });

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, timezone },
  });
  if (createErr) {
    await admin.rpc("refund_invitation", { p_code: code });   // kode dikembalikan bila akun gagal dibuat
    const dup = /already|registered|exists/i.test(createErr.message);
    return json(req, dup ? 409 : 400, { error: dup ? "Email sudah terdaftar" : "Gagal membuat akun" });
  }
  return json(req, 200, { ok: true });
});
