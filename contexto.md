# Sistema CAC — Contexto del Proyecto
> Pasa este archivo a Claude al inicio de cada sesión para mantener coherencia.
> Última actualización: 05-06-2026

---

## Stack técnico
| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JS vanilla (sin frameworks) |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + contraseña) |
| Deploy | Vercel — dominio: dschillan.vercel.app |
| Repositorio | GitHub — DSCHILLAN (público) |

---

## Supabase
- **URL:** `https://iwaosynzrbhkwcmhiilx.supabase.co`
- **Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YW9zeW56cmJoa3djbWhpaWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTU4NzUsImV4cCI6MjA5NTk5MTg3NX0.LwOaFc7vObJlR3Muer7uZxCYSphe2EbYjPTkZ6lGrXQ`
- **Service role key:** en Vercel env vars (no va en el código)

---

## Sesión / Auth
El login está centralizado en `index.html`. Al autenticarse guarda en `sessionStorage`:
```
sb_token   → JWT de Supabase
sb_uid     → UUID del usuario
sb_email   → correo del usuario
```
Cada módulo verifica el token al cargar. Si no hay token → redirige a `index.html`.

---

## Estructura de archivos
```
/
├── index.html           → Login (solo login, redirige a dashboard)
├── dashboard.html       → Panel central de módulos
├── recaudaciones.html   → Módulo morosidad (Felipe)
├── presupuesto.html     → Módulo presupuesto (Jordan)
├── inventario.html      → Módulo inventario (Jordan)
├── CONTEXTO.md          → Este archivo
├── /api
│   └── send-email.js    → Serverless function Vercel (envío correos)
└── vercel_nuevo.json    → Config Vercel
```

---

## Tablas Supabase

### `app_usuarios` (existente, extendida)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Mismo ID que auth.users |
| nombre | TEXT | Nombre completo |
| email | TEXT | Correo |
| rol | TEXT | Ver roles abajo |
| departamento | TEXT | Área responsable |
| modulos | TEXT[] | Módulos habilitados |

**Roles válidos:** `admin`, `operador`, `directorio`, `superusuario`, `presupuesto`, `recaudaciones`

### `presupuesto_filas`
| Campo | Tipo |
|-------|------|
| id | BIGSERIAL |
| anio | INTEGER |
| departamento | TEXT |
| actividad | TEXT |
| descripcion | TEXT |
| tipo | TEXT (Inversión / Gasto corriente / Personal / Servicios) |
| grupo_cuenta | TEXT |
| cuenta | TEXT |
| moneda | TEXT (CLP / UF / USD) |
| monto | NUMERIC |
| creado_por | UUID → auth.users |

### `inv_articulos`
Campos clave: `codigo` (único, formato Defontana), `descripcion`, `bodega`, `stock`, `unidad`, `procedencia`, `moneda_ref`, `costo`, `activo`

### `inv_bodegas`
`nombre`, `descripcion`, `responsable`, `centro_costo`

### `inv_consumos`
`articulo_id`, `cantidad`, `fecha`, `departamento`, `responsable`, `costo_total` (columna generada)

---

## Roles y accesos
| Rol | Recaudaciones | Presupuesto | Inventario | Admin usuarios |
|-----|:---:|:---:|:---:|:---:|
| superusuario | ✓ | ✓ | ✓ | ✓ |
| recaudaciones | ✓ | — | — | — |
| presupuesto | — | ✓ (solo su depto) | — | — |
| admin / directorio | ✓ | — | — | — |
| operador | — | — | — | — |

---

## Superusuarios actuales
- **Felipe Catalán** — felipecatalan@dschillan.cl
- **Jordan Riquelme** — jordanriquelme@dschillan.cl

---

## Estilos y diseño (compartidos entre módulos)
```css
/* Fuentes */
font-family: 'DM Sans', sans-serif;
font-family: 'Playfair Display', serif; /* títulos */
font-family: 'DM Mono', monospace;      /* montos, códigos */

/* Paleta de colores */
--bg:     #F4F1EB   /* fondo general */
--card:   #FDFCF8   /* tarjetas */
--ink:    #1C1A14   /* texto principal */
--ink3:   #7A7670   /* texto secundario */
--red:    #B5320E   /* acento principal / alerta */
--green:  #2A6040   /* positivo */
--blue:   #1A4A7A   /* información */
--amber:  #9A5C08   /* advertencia */

/* Header */
background: #1C1A14 (--ink)
border-bottom: 3px solid var(--red)  ← cada módulo puede usar su color
```

---

## Flujo de navegación
```
index.html (login)
    ↓ login exitoso / token existente
dashboard.html (panel de módulos)
    ↓ según rol del usuario
recaudaciones.html  /  presupuesto.html  /  inventario.html
    ↓ botón "← Panel"
dashboard.html
    ↓ botón "Salir"
index.html
```

---

## Módulo Recaudaciones (Felipe)
- Lee datos desde vistas Supabase: `v_mora_diaria`, `v_evolucion_sostenedor_diaria`, `snapshots_diarios`, `log_importaciones`
- Importa CSV/XLSX desde Syscolnet (MOROSOS_ALUMNO)
- Envío de correos via `/api/send-email.js` (Microsoft 365 OAuth)
- Funciones clave: `bootDashboard()`, `loadSnapshot()`, `doImport()`, `enviarCorrespondencia()`

## Módulo Presupuesto (Jordan)
- Tabla: `presupuesto_filas`
- Estructura: Actividad, Descripción, Departamento, Tipo, Grupo Cuenta, Cuenta, Moneda, Monto
- RLS: superusuarios ven todo, responsables solo su departamento
- Exporta a Excel compatible con Defontana
- Datos aún en mock (arrays JS) — pendiente conectar a Supabase con `sbGet/sbPost`

## Módulo Inventario (Jordan)
- Tablas: `inv_articulos`, `inv_bodegas`, `inv_consumos`
- Campos obligatorios Defontana: Identificador, Descripción, Unidad medida, Procedencia, Moneda referencia, Moneda venta, Unidad venta, Precio base
- Trigger en DB descuenta stock automáticamente al insertar consumo
- Exporta CSV de consumo por período para imputación contable
- Datos aún en mock — pendiente conectar a Supabase

---

## Pendientes
- [ ] Conectar `presupuesto.html` a Supabase (reemplazar arrays mock por `sbGet/sbPost`)
- [ ] Conectar `inventario.html` a Supabase
- [ ] Service role key → mover a Vercel env vars (no dejar en código)
- [ ] Login con Microsoft (objetivo mediano plazo)
- [ ] Módulo Reportes (próximamente)
