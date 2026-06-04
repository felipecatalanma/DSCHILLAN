// api/send-email.js
// Función serverless de Vercel que envía correos via Microsoft Graph
// Evita el bloqueo CORS al llamar a login.microsoftonline.com desde el browser

export default async function handler(req, res) {
  // CORS headers para permitir llamadas desde el HTML
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { tenantId, clientId, clientSecret, from, emails } = req.body;

  // Validar campos obligatorios
  if (!tenantId || !clientId || !clientSecret || !from || !emails?.length) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    // 1. Obtener token OAuth2 (client_credentials)
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     clientId,
          client_secret: clientSecret,
          scope:         'https://graph.microsoft.com/.default',
        }),
      }
    );

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(401).json({
        error: 'Error de autenticación con Microsoft 365',
        detail: tokenData.error_description || tokenData.error
      });
    }

    const accessToken = tokenData.access_token;

    // 2. Enviar cada correo
    const results = [];
    for (const email of emails) {
      try {
        const mailRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${from}/sendMail`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                subject: email.subject,
                body: {
                  contentType: 'Text',
                  content: email.body,
                },
                toRecipients: [{
                  emailAddress: {
                    address: email.to,
                    name:    email.toName || email.to,
                  }
                }],
                from: {
                  emailAddress: { address: from }
                },
              },
              saveToSentItems: true,
            }),
          }
        );

        if (mailRes.ok || mailRes.status === 202) {
          results.push({ to: email.to, ok: true });
        } else {
          const errBody = await mailRes.text();
          results.push({ to: email.to, ok: false, error: errBody });
        }
      } catch (e) {
        results.push({ to: email.to, ok: false, error: e.message });
      }
    }

    const sent  = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return res.status(200).json({ sent, failed, results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
