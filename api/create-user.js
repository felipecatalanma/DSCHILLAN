export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, nombre, rol, departamento, modulos } = req.body;
  const SB_URL = 'https://iwaosynzrbhkwcmhiilx.supabase.co';
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  try {
    // 1. Crear usuario en Supabase Auth
    const authRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_SERVICE,
        'Authorization': `Bearer ${SB_SERVICE}`
      },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const authData = await authRes.json();
    if (!authRes.ok) throw new Error(authData.message || 'Error al crear en Auth');

    // 2. Insertar en app_usuarios
    const dbRes = await fetch(`${SB_URL}/rest/v1/app_usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_SERVICE,
        'Authorization': `Bearer ${SB_SERVICE}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ id: authData.id, nombre, email, rol, departamento, modulos })
    });
    if (!dbRes.ok) throw new Error('Error al insertar en app_usuarios');

    return res.status(200).json({ success: true, id: authData.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
