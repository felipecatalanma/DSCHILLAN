// api/admin-users.js
// Operaciones admin de Supabase Auth que requieren service_role key.
// La key se guarda como variable de entorno en Vercel (nunca en el código).
//
// Configurar en Vercel → Settings → Environment Variables:
//   SUPABASE_SERVICE_ROLE_KEY = eyJ... (la service_role key de Supabase Settings → API)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YW9zeW56cmJoa3djbWhpaWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxNTg3NSwiZXhwIjoyMDk1OTkxODc1fQ.lxGtLEvyRPpSZWPN-1MAPAMtnkt5aD8Z35UdmwxBcvM';
  const SB_URL = process.env.SUPABASE_URL || 'https://iwaosynzrbhkwcmhiilx.supabase.co';

  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };

  const { action, email, password, userId } = req.body || {};

  try {
    // ── CREAR USUARIO ─────────────────────────────────────
    if (action === 'create') {
      if (!email || !password) {
        return res.status(400).json({ error: 'email y password son requeridos' });
      }
      const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method:  'POST',
        headers,
        body: JSON.stringify({ email, password, email_confirm: true })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.message || data.error });
      return res.status(200).json({ id: data.id, email: data.email });
    }

    // ── RESETEAR CONTRASEÑA ───────────────────────────────
    if (action === 'reset_password') {
      if (!userId || !password) {
        return res.status(400).json({ error: 'userId y password son requeridos' });
      }
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
        method:  'PUT',
        headers,
        body: JSON.stringify({ password })
      });
      if (!r.ok) {
        const data = await r.json();
        return res.status(r.status).json({ error: data.message || data.error });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida: ' + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
