# Contexto del proyecto — Módulo de Presupuesto CAC

Este documento resume el estado y la historia de cambios del módulo de
**Presupuesto** (`presupuesto.html`) y los ajustes relacionados en
`dashboard.html`, para que una nueva conversación pueda retomar el trabajo
sin perder contexto.

Archivos relevantes:
- `presupuesto.html` — módulo de Carga de Presupuesto, Ejecución, Consolidado
  y Cuentas Contables.
- `dashboard.html` — panel principal, gestión de usuarios/roles.
- `recaudaciones.html` — módulo de morosidad (referencia para el patrón de
  panel de Configuración ⚙ y tabla `configuracion`).
- `migracion_presupuesto.sql` — todas las migraciones SQL acumuladas para
  Supabase (tablas, columnas, políticas RLS).
- `Cuentas_contables.xlsx` — fuente original de la estructura de tipos y
  subtipos de gasto (docente / administración).

---

## 1. Estructura de datos y constantes clave

### Departamentos (`DEPARTAMENTOS`)
Lista única de departamentos/áreas/jefaturas, usada para: selector de área,
vista previa por jefatura, permisos por subtipo, y el campo "Rol" en
Dashboard. Cada departamento tiene `{nombre, tipo: 'docente'|'admin',
jefatura, esRRHHDept?}`.

Docentes: Subdirección Académica, Alemán (Jorge Álvarez), Inglés, Lenguaje,
Educación Física, ACLE, Ciencias, Matemáticas, Párvulos, Arte y Música,
Historia y Ciencias Sociales, IB.

Administración/Responsables: Dirección, Administración, Informática,
Biblioteca, Mantenimiento, RRHH (`esRRHHDept:true`).

> **Estandarización**: "Tecnología" se renombró a **"Informática"** en todo
> el sistema (presupuesto.html y dashboard.html), con migración SQL de datos
> existentes.

### Tipos de gasto (`GASTOS_DOCENTES`, `GASTOS_ADMIN`)
Estructura tomada de `Cuentas_contables.xlsx`: cada tipo tiene `label`,
`soloRRHH?` (true para `Otros_Gastos_del_Personal_Docente`,
`Remuneracion_Docente`, `Remuneracion_Administrativos`) y un array
`subtipos: [{codigo, nombre}]` con el código de cuenta contable exacto.

Estos dos objetos se copian a `_gastosState = {docente: {...}, admin: {...}}`
al iniciar — es la copia **editable** (se puede renombrar/eliminar/agregar
subtipos desde la pestaña Cuentas Contables, y los cambios se reflejan en
toda la app vía `tipoLabel()`, `poolDocente()`, `poolAdmin()`,
`poolPara(depto)`).

---

## 2. Roles y permisos (reestructuración completa)

### Antes
- `app_usuarios.rol` mezclaba "tipo de acceso" y "área de responsabilidad"
  (`superusuario`, `presupuesto`, `presupuesto_docente`, `presupuesto_rrhh`,
  `recaudaciones`, `operador`...).
- `app_usuarios.departamento` = área responsable (con "Tecnología").

### Ahora
- **`tipo_usuario`** (nuevo, en `app_usuarios`): `superusuario` | `estandar`.
  Define el nivel de acceso (superusuario = acceso total a todo el sistema).
- **`rol_area`** (nuevo, en `app_usuarios`, también espejado en
  `departamento` por compatibilidad): el "Rol" de la persona — un valor de
  la lista de `DEPARTAMENTOS` + `RRHH` + **`Recaudaciones`** (nuevo rol
  agregado para Fabiola).
- En `presupuesto.html`, `_currentUser.rol` queda normalizado a
  `superusuario` | `usuario_estandar` (constante
  `TIPOS_USUARIO_PERMITIDOS`), y `_currentUser.rol_area` es el área activa.
- **Retro-compatibilidad**: si `rol_area` viene vacío, se infiere desde
  `departamento` o desde el `rol` técnico antiguo
  (`presupuesto_rrhh` → `RRHH`). Fabiola: `rol` técnico sigue siendo
  `recaudaciones` (para no perder permisos en `recaudaciones.html`), pero
  `tipo_usuario='estandar'` y `rol_area='Recaudaciones'`.

### Dashboard (`dashboard.html`)
- Columna **"Rol"** (antes "Departamento responsable") → ahora usa la lista
  completa de `DEPARTAMENTOS` + RRHH + **Recaudaciones**.
- Columna **"Tipo de Usuario"** (antes "Rol") → Superusuario / Usuario
  Estándar.
- Función `derivarRolTecnico(tipoUsuario, areaRol)` calcula el `rol` técnico
  que usan los demás módulos a partir de `tipo_usuario` + `rol_area`.

---

## 3. Permisos por subtipo de gasto (Cuentas Contables)

Se reemplazó un esquema de permisos **por tipo** (`_permisos`,
tabla `presupuesto_permisos` — ahora **legacy/sin uso real**, ya no se
escribe desde la UI) por un esquema **por subtipo**, mucho más granular:

- Estado: `_permisosSub[clave] = {tiposUsuario: ['superusuario',
  'usuario_estandar'], roles: [nombresDepartamento...]}`
  donde `clave = "<tipoKey>|||<nombreSubtipo>"` (función `ccKey`).
- `getPermisoSub(tipo, subNombre)` genera un valor por defecto si no existe,
  heredando de `_permisos[tipo]` (seed inicial vía `defaultPermisos()`).
- Persistencia: tabla `presupuesto_permisos_sub` (clave, tipo, subtipo,
  tipos_usuario jsonb, roles jsonb).
- Función central: **`puedeVerSubtipo(tipo, subNombre, rolArea)`** — filtra
  filas en Carga/Ejecución y opciones del selector "Subtipo / Ítem".
  - Si `tipo` no existe en `_gastosState.docente`/`.admin` (p.ej. una fila
    insertada manualmente por SQL con un tipo no reconocido), **no se
    restringe** — se considera visible siempre (fix para evitar que filas
    "huérfanas" desaparezcan).
- `puedeVerTipo(tipo, depto)` sigue existiendo (nivel tipo, usa `_permisos`
  con fallback "todos permitidos" si el tipo no está registrado).

---

## 4. Pestaña "Cuentas Contables" (mantenedor)

Rediseñada en **3 paneles verticales**:

1. **Panel izquierdo**: selector Docente / Administración (grupo).
2. **Panel central**: acordeón de tipos de gasto del grupo elegido.
   - Cada tipo se puede **renombrar** (✏).
   - Al expandir un tipo se listan sus subtipos con código de cuenta.
   - Cada subtipo se puede **editar** (nombre **y código de cuenta
     numérico** — `cc-subtipo-edit-code`) o **eliminar** (con confirm).
   - Al cambiar el código de un subtipo, se propaga automáticamente a las
     filas de `_filas`/`presupuesto_lineas` que lo usan.
3. **Panel derecho**: al seleccionar un subtipo, muestra:
   - Sección **"Tipos de Usuario"**: Superusuario (siempre activo, no
     editable) / Usuario Estándar — switches `cc-switch`.
   - Sección **"Roles"**: misma agrupación que el preview por jefatura
     (Jefaturas Docentes / Responsables de Área), con switch por
     departamento para habilitar/deshabilitar acceso a ese subtipo.
   - Botón **Guardar** → persiste en `presupuesto_permisos_sub`
     (`sbUpsert`).

**Agregar cuenta contable**: botón "+ Agregar cuenta contable" → modal
(`modal-cuenta-nueva`) con flujo Grupo (Docente/Admin) → Tipo de Gasto →
nombre + código del nuevo subtipo. Se integra al árbol y queda disponible de
inmediato en Carga de Presupuesto.

**Importante**: en los `<select>` de "Subtipo / Ítem" de la fila de Carga
(`opcionesSubtipoDraft`), **solo se muestra el nombre del subtipo**, sin el
código de cuenta — para todos los perfiles (el código contable es
información interna del mantenedor).

---

## 5. Carga de Presupuesto — edición inline (sin modal)

Se eliminó el modal "Agregar/Editar fila". Ahora todo es **inline** en la
tabla:

- Botón **"+ Agregar Ítem"** (antes "+ Agregar fila") está en el extremo
  derecho del `<thead>`, en la columna **Acciones**, que tiene
  `position: sticky; right: 0` (queda fija durante scroll horizontal, como
  "inmovilizar paneles" en Excel). Aplica también a las filas, fila de
  edición y fila de Total.
- Al hacer clic, se agrega una fila editable al final (`_filaEnEdicion`,
  `_filaDraft`). Editar (✏) convierte esa fila en editable in-place;
  ✓ guarda (`guardarFilaDraft`), ✕ cancela.
- Eliminar (🗑) abre `modal-confirm-delete` (modal estético de confirmación)
  y borra el registro real de `presupuesto_lineas` vía `sbDelete`.

### Columnas actuales de la tabla de Carga (`TODAS_COLUMNAS`)
`Actividad o Gasto, Descripción, Tipo de Gasto, Subtipo/Ítem, Cuenta Contable
(solo superusuario), Moneda (solo superusuario), Monto, Cant., Cuotas, Ene..Dic
(12 columnas de mes), Total, Acciones`.

- **Departamento**: se quitó como columna — se determina por el selector
  "Área" superior (que ya filtra correctamente por `rol_area` para
  no-superusuarios).
- **Grupo Cuenta**: se quitó de la vista (es redundante con Tipo de Gasto);
  el dato sigue existiendo internamente (`grupoCuenta` / `grupo_cuenta`).
- **Cantidad**: nueva, junto a Monto.
- **Meses (Ene–Dic)**: checkboxes para marcar en qué meses se ejecuta el
  gasto.
- **Cuotas**: checkbox "Pago en cuotas" + n° de cuotas. Reglas de
  validación:
  - Si NO está en cuotas: máximo de meses seleccionables = `cantidad`.
  - Si está en cuotas: máximo de meses seleccionables = `cuotas`.
  - Los checkboxes de mes que excedan el máximo se deshabilitan; se muestra
    un contador "Llevas X/Y" debajo de la fila en edición
    (`mesesMaxPermitidos`, `mesesSeleccionados`, `ajustarMesesAlLimite`).
- **Total**: `monto * cantidad` (función `totalFila`). Se muestra por fila y
  como total general en un `<tfoot id="carga-tfoot">`.

### Estilo de texto
Todo el contenido de las filas (actividad, tipo, subtipo, montos, cantidad,
total, etc.) usa el gris `var(--ink3)`, igual que descripción/cuenta
contable — se quitó el badge azul que destacaba el Tipo de Gasto.

---

## 6. Permisos de acceso al módulo (vista por defecto / vista previa)

- **Vista por defecto al entrar**: el selector de Área (`select-area-carga`,
  `select-area-exec`) se preselecciona con `deptoActivo()` =
  `_currentUser.rol_area` (el área del usuario). Superusuarios pueden elegir
  "Todos los departamentos" o cualquier otro.
- **Vista previa por jefatura** (`preview-controls`, solo superusuarios):
  dropdown agrupado en "Jefaturas Docentes" y "Responsables / Áreas" (mismos
  grupos que `DEPARTAMENTOS`). Al seleccionar uno, `_previewDepto` simula:
  - El perfil efectivo (`perfilEfectivo()`): `jefe_docente` | `jefe_admin` |
    `rrhh` según el departamento.
  - Filtra `_filas` para mostrar solo lo cargado en ese departamento.
  - Modo **solo lectura** (no se puede agregar/editar/eliminar en preview).
- `puedeEditarDepto(depto)`: superusuario siempre puede; usuario estándar
  solo si `rol_area === depto` y no está en preview ni bloqueado por fecha
  (ver sección 7).

---

## 7. Panel de Configuración del módulo (⚙, solo superusuarios)

Patrón tomado de `recaudaciones.html` (tabla compartida `configuracion`,
clave/valor).

- Botón **⚙** junto al título "Presupuesto" (`btn-config`), visible solo
  para `tipo_usuario='superusuario'`.
- Modal `modal-config` (`openConfigPanel` / `closeConfigPanel` /
  `guardarConfigModulo`):
  - **Año activo del módulo** (`cfg-anio-activo`, select año actual-1 .. +3):
    se guarda en `configuracion.presupuesto_anio_activo` y se aplica a
    `_anio` para **todos los usuarios** al cargar el módulo.
  - **Rango habilitado para Carga de Presupuesto** (`cfg-carga-inicio`,
    `cfg-carga-fin`, tipo `date`): se guarda en
    `configuracion.presupuesto_carga_inicio` /
    `presupuesto_carga_fin`. Si está vacío, no aplica restricción.
- `cargaBloqueadaPorFecha()`: para usuarios **no superusuarios**, si hoy está
  fuera del rango `[cargaInicio, cargaFin]`, la pestaña "Carga de
  Presupuesto" se bloquea:
  - Se muestra `#carga-locked-banner` con el rango habilitado
    (`#carga-locked-rango`).
  - Se ocultan/deshabilitan los botones de agregar/editar/eliminar
    (`puedeEditar = puedeEditarDepto(area) && !bloqueado`).
  - Los superusuarios **nunca** quedan bloqueados.
- `cargarConfigModulo()` se llama en `initApp()` antes de fijar `_anio`.

---

## 8. Esquema de base de datos (Supabase) — `migracion_presupuesto.sql`

Tablas y columnas relevantes (todas con `create table if not exists` /
`add column if not exists`, idempotentes, con `drop policy if exists` antes
de cada `create policy`):

1. **`presupuesto_lineas`** — líneas de presupuesto (antes solo mock):
   `id, actividad, descripcion, departamento, tipo, subtipo, cuenta,
   grupo_cuenta, moneda, monto, cantidad (numeric, default 1),
   meses (jsonb, array de 12 booleanos), en_cuotas (boolean), cuotas (int),
   anio, created_at, updated_at`. RLS: select/insert/update/delete para
   `authenticated`.
2. **`presupuesto_permisos`** — *legacy*, permisos por tipo (ya no se
   escribe desde la UI, pero se mantiene por compatibilidad si existía).
3. **`presupuesto_permisos_sub`** — permisos por subtipo:
   `clave (PK) = "<tipo>|||<subtipo>", tipo, subtipo,
   tipos_usuario (jsonb), roles (jsonb)`.
4. **`configuracion`** — clave/valor compartida (igual patrón que
   `recaudaciones.html`): `clave (PK), valor, updated_at`. Claves usadas por
   Presupuesto: `presupuesto_anio_activo`, `presupuesto_carga_inicio`,
   `presupuesto_carga_fin`.
5. **`app_usuarios`**:
   - `tipo_usuario` (text, default `'estandar'`, check
     `in ('superusuario','estandar')`).
   - `rol_area` (text) — espejo del nuevo "Rol".
   - Migraciones de datos: superusuarios existentes →
     `tipo_usuario='superusuario'`; Fabiola (`rol='recaudaciones'`) →
     `tipo_usuario='estandar', rol_area='Recaudaciones'`; resto →
     `rol_area = departamento`; `"Tecnología"` → `"Informática"` en
     `app_usuarios.departamento` y `presupuesto_lineas.departamento`.

Función auxiliar compartida: `set_updated_at()` (trigger genérico para
`updated_at`).

---

## 9. Normalización defensiva de datos (`migrarFilaLegacy`)

Al cargar filas desde `presupuesto_lineas` (o desde `_mock` si la tabla no
existe / `_usingDB=false`), se aplica `migrarFilaLegacy(f)`:

- Migra claves de `tipo` antiguas/legacy a las nuevas (ej.
  `'Actividades_Pedagógicas'` → `'Actividades_Pedagogicas'`,
  `'Inversión'` → `'Soporte_e_Insumos_Computacionales'`, etc.)
- `"Tecnología"` → `"Informática"` en `departamento`.
- `anio`: si viene como string, se convierte a number (evita que
  `f.anio === _anio` falle por comparación estricta de tipos).
- Trim de espacios en `departamento, tipo, subtipo, cuenta, grupoCuenta,
  moneda, actividad` (defensa ante datos cargados manualmente por SQL).
- Defaults para campos nuevos: `cantidad>=1`, `meses` array de 12 booleanos,
  `enCuotas: boolean`, `cuotas: number|null`.

---

## 10. Pendientes / cosas a vigilar

- **`presupuesto_permisos`** (tabla legacy a nivel de tipo) puede tener
  datos antiguos de pruebas que ya no se editan desde la UI pero
  `cargarPermisos()` los sigue leyendo y mezclando en `_permisos`. Si en el
  futuro aparecen filas/tipos que se ven u ocultan de forma inesperada y no
  se explica por `_permisosSub`, revisar/limpiar esta tabla o considerar
  dejar de leerla.
- Verificar que el HTML desplegado en producción (Vercel) esté siempre
  sincronizado con la última versión de `presupuesto.html` — un mismatch
  entre JS y HTML (IDs de elementos como `carga-tfoot`,
  `carga-locked-banner`) puede producir errores tipo
  `Cannot set properties of null (setting 'innerHTML')`.
- El "Año activo del módulo" (`presupuesto_anio_activo`) y el "Rango
  habilitado para Carga" (`presupuesto_carga_inicio/fin`) son
  configuraciones independientes: el rango de fechas no cambia
  automáticamente el año presupuestario activo.
- Próximo paso anunciado por el usuario: restringir aún más por subtipo —
  ej. que solo RRHH/superusuario puedan cargar Remuneraciones, y que un
  responsable de área académica no pueda ingresar ciertos tipos de gasto que
  no le competen (la base para esto — `_permisosSub` por departamento — ya
  está implementada, falta seguir afinando la configuración real por
  subtipo en la pestaña Cuentas Contables).
