# CAMBIOS — Etapa 0 + Etapa 1

**Versión:** `1.3-seguro` → `2.0-core`
**Fecha:** 2026-11-03
**Alcance:** correcciones críticas de seguridad + núcleo modular (NEOIA CORE)

---

## ETAPA 0 — Correcciones críticas

### 0.1 Sesiones con caducidad (antes: eternas)

| Archivo | Cambio |
|---|---|
| `server.py` | Constantes `SESSION_TTL_DAYS` (30 por defecto, configurable) y `SESSION_TOUCH` |
| `server.py` | Migración ligera: `ALTER TABLE sessions ADD COLUMN last_used TEXT` |
| `server.py` | `auth_user()` comprueba caducidad, borra la sesión vencida y hace un *toque perezoso* de `last_used` (máximo 1 escritura por hora) |

**Por qué:** un token robado era válido para siempre.

### 0.2 Cabeceras de seguridad (antes: ninguna)

Se añaden a **todas** las respuestas (`_json` y `_static`):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy` completa (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`)

**Se elimina `Access-Control-Allow-Origin: *`.** El frontend es del mismo origen:
el CORS abierto solo servía para que cualquier web llamara a la API.

### 0.3 Fin de la fuga de errores internos

| Antes | Ahora |
|---|---|
| `self._json(500, {"error": str(e)})` en `/api/image` | Mensaje genérico + traza en el log del servidor |
| Excepciones del proveedor con texto interno | `ProviderError` con mensaje curado |

### 0.4 `/api/status` informa la versión

Permite verificar qué versión está realmente desplegada. Antes era imposible.

---

## ETAPA 1 — NEOIA CORE

### Estructura nueva

```
core/
  __init__.py     exporta providers, router, agents
  providers.py    DeepSeek | Ollama | OpenAI-compatible
  router.py       perfiles por tarea: chat, code, robotics, fast
  agents.py       registro declarativo de agentes
```

### 1.1 `core/providers.py`

- `DeepSeekProvider` — comportamiento idéntico al anterior.
- `OllamaProvider` — modelo local, **detecta automáticamente** el modelo instalado
  si el configurado no existe. Nuevo: antes no había soporte local.
- `OpenAICompatProvider` — cualquier endpoint compatible.
- `ProviderError` — única excepción que puede llegar al usuario, con mensaje seguro.
- Selección por `NEOIA_PROVIDER` (por defecto `deepseek`).

### 1.2 `core/router.py`

Perfiles por tarea, con temperatura y límites distintos:

| Tarea | Temperature | max_tokens | timeout |
|---|---|---|---|
| `chat` | 0.5 | 1500 | 120 s |
| `code` | 0.25 | 2200 | 150 s |
| `robotics` | 0.35 | 2000 | 150 s |
| `fast` | 0.2 | 400 | 60 s |

Cambiar de proveedor o modelo ya no requiere tocar `server.py`.

### 1.3 `core/agents.py`

Registro con `Agent(id, name, description, task, system, enabled)`.
`public_list()` nunca expone el prompt de sistema.

Agente registrado en esta etapa: `general`.

### 1.4 Endpoints

| Nuevo/modificado | Detalle |
|---|---|
| `GET /api/agents` | Catálogo de agentes (público, sin prompts) |
| `POST /api/chat` | Acepta campo opcional `agent` |
| `GET /api/admin` | Añade `providers` (estado del router) y `agents` |

### 1.5 Compatibilidad

`call_deepseek()` se conserva como envoltorio del router. Ninguna llamada
existente cambia de firma. El chat, las imágenes, el historial y los planes
siguen funcionando igual.

---

## INFRAESTRUCTURA

| Archivo | Cambio |
|---|---|
| `Dockerfile` | `COPY core ./core` — **necesario o el contenedor no arranca** |
| `render.yaml` | Nueva variable `SESSION_TTL_DAYS=30` |

---

## PRUEBAS

### `tests/smoke.py` — 21 comprobaciones, 0 fallos

```
python tests/smoke.py
```

Cubre: arranque, cabeceras de seguridad, ausencia de CORS abierto, versión,
catálogo de agentes, error seguro sin proveedor, registro, `/api/me`,
existencia de `last_used`, expiración de sesión (401 + borrado real en la base),
y estáticos.

### `tests/e2e_ollama.py` — cadena completa con modelo real

```
python tests/e2e_ollama.py
```

Resultado real: `200` en **74,2 s** con `qwen2.5-coder` local.
Demuestra `providers → router → agents → HTTP` sin coste de API.

> **Limitación conocida:** el camino real contra DeepSeek no se ha probado en
> esta máquina porque no hay `DEEPSEEK_API_KEY` local. Se verificará al desplegar.

---

## LO QUE NO SE HA TOCADO

Chat, historial, imágenes, búsqueda, planes, panel de administración,
identidad visual, SEO, landing y páginas legales.

---

## PENDIENTE (Etapa 2 en adelante)

1. Productos CODE / ROBOTICS / STUDIO como modos del motor.
2. Persistencia real (Turso) — hoy la base sigue siendo efímera en Render.
3. Roles de usuario y registro de actividad.
4. Mover el token de `localStorage` a cookie `HttpOnly` (requiere protección CSRF).
5. Quitar `'unsafe-inline'` del CSP moviendo el JS a archivos externos.
