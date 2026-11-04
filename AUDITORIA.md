# AUDITORÍA TÉCNICA — NEOIA

**Fecha:** 2026-11-03
**Alcance:** repositorio `neoia-cloud` completo (commit `f8c19f6`)
**Método:** inspección directa del código, consultas al servicio en producción, revisión de configuración de despliegue.

---

## 1. DIAGNÓSTICO TÉCNICO

El código no es un prototipo desechable: es un sistema **pequeño, coherente y funcional**.

| Métrica | Valor |
|---|---|
| Archivos versionados | 16 |
| Tamaño total | 146 KB |
| Backend | 503 líneas (`server.py`) |
| Frontend principal | 717 líneas (`chat.html`) |
| Endpoints | 15 |
| Dependencias externas | **0** |
| Cobertura de tests | **0 %** |

**Lo que está bien hecho y conviene reconocer:**

- **Cero inyección SQL.** Las 20 consultas usan parámetros (`?`), ninguna concatena cadenas. Verificado línea por línea.
- **Contraseñas con PBKDF2-SHA256**, 120.000 iteraciones, salt por usuario (`server.py:107-109`).
- **Escapado XSS** en el frontend con `esc()` aplicado a todo contenido de usuario (`chat.html:431`).
- **Secretos fuera del repo**: `DEEPSEEK_API_KEY` se lee del entorno y `.gitignore` bloquea `.env` y `*.key`.
- **Diseño minimalista intencional**: sin dependencias, despliegue instantáneo, superficie de ataque pequeña.

Esto es una base sólida. El problema no es la calidad del código: es **el techo arquitectónico**.

---

## 2. ARQUITECTURA ACTUAL

```
┌─────────────────────────────────────────────────────┐
│  Navegador                                          │
│  chat.html · landing.html · admin.html              │
│  (JS vanilla, token en localStorage)                │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS  /api/*
┌──────────────────▼──────────────────────────────────┐
│  server.py — ThreadingHTTPServer (1 proceso)        │
│                                                     │
│  · rate_ok()      30 req/min por IP, en memoria     │
│  · auth_user()    token → tabla sessions            │
│  · admin_ok()     token → dict en memoria, 30 min   │
│  · call_deepseek()  urllib → api.deepseek.com       │
│  · make_image()     urllib → pollinations.ai        │
│  · web_search()     DDG / Bing / Wikipedia          │
└──────────────────┬──────────────────────────────────┘
                   │ sqlite3
┌──────────────────▼──────────────────────────────────┐
│  neoia.db  (disco EFÍMERO del contenedor)           │
│  users · sessions · conversations · messages        │
│  memory (clave-valor)                               │
└─────────────────────────────────────────────────────┘
```

**15 endpoints:** `status`, `plan-info`, `stats`, `admin`, `me`, `conversations`,
`conversation`, `chat`, `auth/register`, `auth/login`, `auth/logout`,
`conversation/delete`, `search`, `image`, `admin/login`.

---

## 3. PROBLEMAS ENCONTRADOS

### 🔴 Críticos (rompen la promesa del producto)

**3.1 — La base de datos se borra en cada despliegue.**
`DB_PATH` apunta a un archivo dentro del contenedor (`server.py:26`). En Render
plan gratuito el sistema de archivos es efímero: **cada deploy elimina todos los
usuarios, conversaciones y cuentas**. No es un bug menor: hace imposible operar
como empresa. Un "ecosistema" que pierde sus datos cada semana no es un ecosistema.

**3.2 — Las sesiones no expiran nunca.**
La tabla `sessions` (`server.py:92`) guarda `token, user_id, created_at` y **no
tiene TTL, ni `last_used`, ni revocación masiva**. Un token robado es válido para
siempre. El `auth_user()` (`server.py:123`) solo comprueba que el token exista.

**3.3 — El token vive en `localStorage`** (`chat.html:448`).
Es accesible desde cualquier JavaScript de la página. Con el escapado actual el
riesgo es bajo, pero **no hay CSP**, así que cualquier inyección futura sería
ejecutable. El estándar es cookie `HttpOnly` + `SameSite`.

### 🟠 Graves (deuda que bloquea el crecimiento)

**3.4 — Fuga de información en errores.**
`server.py:515` devuelve `{"error": str(e)}` al cliente. Expone mensajes internos
de DeepSeek, rutas de archivos y detalles de implementación.

**3.5 — Sin migraciones de base de datos.**
Todo el esquema se crea con `CREATE TABLE IF NOT EXISTS`. La primera vez que haya
que añadir una columna a `users`, no hay ruta segura para hacerlo sin perder datos.

**3.6 — Un solo administrador con contraseña compartida.**
No existen roles, ni cuentas de administrador individuales, ni registro de quién
hizo qué. Para "empresa" esto es insuficiente.

**3.7 — Sin registro de actividad (audit log).**
No hay forma de saber qué usuario hizo qué llamada, ni cuánto costó. Sin esto no
se puede medir consumo por usuario/producto/agente (requisito 9 del prompt).

**3.8 — Cero tests.**
Ninguna funcionalidad tiene verificación automática. Cada cambio es a ciegas.

### 🟡 Menores

- `render.yaml` declara `autoDeploy: true` pero el servicio real no lo aplica.
  *(Corrección posterior: la primera inspección mostró caracteres corruptos en
  `render.yaml`, pero era un artefacto de la consola de Windows. El archivo está
  correctamente en UTF-8.)*
- Rate limiting en memoria: se reinicia con el proceso y no sirve con más de una instancia.
- Sin verificación de email ni recuperación de contraseña.
- Sin cabeceras `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy`.

---

## 4. RIESGOS DE SEGURIDAD

| # | Riesgo | Severidad | Impacto real | Estado |
|---|---|---|---|---|
| 1 | Sesiones eternas | **Alta** | Token filtrado = acceso permanente | ⚠️ Sin mitigar |
| 2 | Token en localStorage sin CSP | **Alta** | Robo de sesión si entra XSS | ⚠️ Sin mitigar |
| 3 | Datos efímeros | **Alta** | Pérdida total de datos | ⚠️ Sin mitigar |
| 4 | Fuga de errores internos | Media | Reconocimiento del sistema | ⚠️ Sin mitigar |
| 5 | Admin único sin roles | Media | Sin trazabilidad | ⚠️ Sin mitigar |
| 6 | Inyección SQL | **Baja** | — | ✅ Mitigado |
| 7 | XSS en chat | Baja | Escapado aplicado | ✅ Mitigado |
| 8 | Secretos en repo | Baja | — | ✅ Mitigado |
| 9 | CSRF | Baja | No se usan cookies | ✅ Por diseño |
| 10 | Fuerza bruta en login | Media | Solo rate limit global | ⚠️ Parcial |

---

## 5. FUNCIONALIDADES QUE DEBEN CONSERVARSE

Ninguna de estas se puede romper en la transformación:

1. Chat con DeepSeek y streaming de respuesta.
2. Historial de conversaciones por usuario (crear, listar, abrir, borrar).
3. Registro, login, logout y sesión persistente.
4. Generación de imágenes vía Pollinations.
5. Búsqueda web multi-fuente con filtro de relevancia.
6. Panel de administración con contraseña.
7. Planes Free / Pro / Escuela (precios, sin cobro).
8. Páginas legales y verificación de Google.
9. SEO implementado (sitemap, canonical, JSON-LD, favicon).
10. Rendimiento: sin dependencias, arranque instantáneo, deploy en segundos.
11. Identidad visual (azul profundo + cian).

---

## 6. ARQUITECTURA OBJETIVO

### Lo que sí es construible con este stack

```
neoia/
  core/
    providers.py     DeepSeek | Ollama | (futuro: OpenAI-compatible)
    router.py        elige modelo y proveedor según la tarea
    agents.py        registro declarativo de agentes
    memory.py        contexto y recuperación
    quota.py         límites por usuario/plan
    audit.py         registro de actividad y consumo
  products/
    code.py          NEOIA CODE   (prompt + herramientas)
    robotics.py      NEOIA ROBOTICS
    studio.py        NEOIA STUDIO
  http/
    routes.py        gateway: validación, auth, límites
  server.py          arranque (compatibilidad con Render)
```

**Punto clave:** los "productos" **no son servicios separados**. Son
configuraciones del mismo motor: un system prompt, un conjunto de herramientas y
unos límites. Eso permite tener cinco divisiones sin multiplicar la
infraestructura ni el coste.

### Lo que NO voy a construir (y por qué)

| Petición | Problema | Decisión |
|---|---|---|
| **Ejecutar código generado** en el servidor | Sin sandbox real, es una puerta abierta a ejecución remota. Con Python en un contenedor de Render, un agente podría leer variables de entorno (tu API key). | ❌ No. NEOIA CODE genera y explica, no ejecuta. |
| **Agentes con acceso al sistema de archivos** | Igual que arriba. | ❌ No en la nube. Solo en la versión local del usuario. |
| **Auto-modificación del código** | Un agente que edita su propio código sin revisión humana es un riesgo que no se puede auditar. | ❌ No. |
| **5 servicios independientes** | Coste, complejidad y latencia sin beneficio con este volumen. | ❌ No. Un monolito modular. |
| **Multiagente ilimitado** | Cada paso = una llamada al modelo. Sin techo, el coste es impredecible y la calidad baja. | ⚠️ Sí, pero con límite duro: máx. 4 pasos y 15.000 tokens por tarea. |

---

## 7. PLAN DE IMPLEMENTACIÓN POR ETAPAS

| Etapa | Alcance | Esfuerzo (1 persona) | Riesgo |
|---|---|---|---|
| **0 · Correcciones críticas** | TTL de sesiones, quitar fugas de error, cabeceras de seguridad, borrar `str(e)` | 4–6 h | Bajo |
| **1 · NEOIA CORE** | `providers.py` + `router.py` + `agents.py` (registro). Sin cambiar el chat. | 2–3 días | Bajo |
| **2 · Productos** | CODE / ROBOTICS / STUDIO como modos + catálogo en la UI | 3–4 días | Medio |
| **3 · Persistencia real** | Postgres o Turso, migraciones, cuotas por usuario | 3–4 días | **Alto** |
| **4 · Multiagente** | Manager + subagentes con límites duros y registro | 3–5 días | **Alto** |
| **5 · Endurecimiento** | Tests, auditoría de seguridad, documentación | 3–4 días | Bajo |

**Total: 3–4 semanas de trabajo efectivo.** No es un fin de semana, y decirlo de
otra forma sería mentirte.

---

## 8. ESTIMACIÓN DE COMPLEJIDAD

| Área | Complejidad | Comentario |
|---|---|---|
| CORE + providers | Baja | Es refactorizar lo que ya existe |
| Productos como modos | Baja | Prompt + herramientas, no infraestructura |
| Persistencia | **Alta** | Requiere añadir dependencia y migrar datos |
| Multiagente | **Alta** | Bucles, coste, errores en cascada |
| UI del dashboard | Media | Maquetación, no lógica |

**Riesgo principal del proyecto:** el coste de las llamadas. Un agente que delega
en otros tres agentes consume 4× tokens por tarea. Con DeepSeek (~0,001 USD por
consulta corta) sigue siendo barato, pero **hay que poner techo desde el día uno**,
o el plan gratuito se convierte en una factura.

---

## 9. ARCHIVOS QUE NECESITARÁN MODIFICACIONES

| Archivo | Cambio | Etapa |
|---|---|---|
| `server.py` | Dividir en módulos; conservar arranque | 1 |
| `core/providers.py` | **Nuevo** | 1 |
| `core/router.py` | **Nuevo** | 1 |
| `core/agents.py` | **Nuevo** | 1 y 4 |
| `core/audit.py` | **Nuevo** | 0 y 3 |
| `core/quota.py` | **Nuevo** | 3 |
| `products/*.py` | **Nuevo** (3 archivos) | 2 |
| `public/chat.html` | Catálogo de productos, estados de agente | 2 |
| `public/dashboard.html` | **Nuevo** | 2 |
| `public/admin.html` | Roles y registro de actividad | 3 |
| `render.yaml` | Corregir codificación; persistencia | 0 y 3 |
| `Dockerfile` | Sin cambios | — |
| `AUDITORIA.md` | Este documento | — |

---

## 10. DECISIÓN PENDIENTE

Para la **Etapa 3** hay una bifurcación que necesita tu decisión:

| Opción | Ventaja | Inconveniente |
|---|---|---|
| **Turso** (SQLite remoto por HTTP) | Cero dependencias nuevas, compatible con el código actual | Servicio externo, límite gratuito |
| **Neon / Supabase** (Postgres) | Estándar de la industria, escalable | Requiere `psycopg2` (primera dependencia externa) |
| **Render Disk** (de pago) | Cambio mínimo | Cuesta dinero cada mes |

---

## CONCLUSIÓN HONESTA

La visión de "empresa de IA con cinco divisiones" es alcanzable **como
arquitectura**, no como infraestructura separada. Lo que hace grande a un producto
de IA no es tener cinco servicios: es que el motor sea bueno y modular.

Mi recomendación es empezar por la **Etapa 0** (medio día, corrige tres agujeros
reales) y la **Etapa 1** (el CORE), que son las que desbloquean todo lo demás sin
tocar lo que ya funciona.

**No he modificado ninguna línea todavía.** Espero tu aprobación.
