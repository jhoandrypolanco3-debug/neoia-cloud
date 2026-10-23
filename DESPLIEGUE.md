# 🚀 CÓMO PUBLICAR NeoIA EN LA NUBE (gratis)

> Con esto tu app deja de depender de tu laptop y queda 24/7 en internet.
> Tiempo: **20 minutos**. Costo: **$0**.

---

## ⚠️ Antes de empezar: qué se sube y qué NO

| ✅ Se sube a la nube | ❌ Se queda en tu PC |
|---|---|
| Chat con IA | Control de tu computadora |
| Generar imágenes | Leer/escribir tus archivos |
| Buscar en internet | Ejecutar comandos |
| Planes y precios | Hologramas/voz/manos |
| Landing page | Compilar proyectos |

**Esto es a propósito:** la nube NO debe poder tocar la computadora de nadie.

---

## PASO 1 — Subir el código a GitHub (5 min)

1. Crea cuenta en **https://github.com** (si no tienes)
2. Pulsa **"New repository"**
3. Nombre: `neoia-cloud`
4. Público o privado (da igual)
5. **NO** marques "README" (ya tienes archivos)

Luego en tu terminal:

```powershell
cd "C:\Users\jhoan\OneDrive\Documents\deepseek-harness\default-workspace\BIOBUZZ-JARVIS\cloud"
git init
git add .
git commit -m "NeoIA cloud"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/neoia-cloud.git
git push -u origin main
```

⚠️ Te pedirá tu usuario y un **token** (no la contraseña):
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Genera uno con permiso `repo`

---

## PASO 2 — Desplegar en Render (10 min)

1. Ve a **https://render.com** → "Get Started" (gratis, con GitHub)
2. Autoriza Render a ver tus repos
3. Pulsa **"New +" → "Web Service"**
4. Elige tu repo `neoia-cloud`
5. Render detecta la config. Confirma:

| Campo | Valor |
|---|---|
| Name | `neoia` |
| Region | Oregon (o el más cercano) |
| Runtime | **Python 3** |
| Build Command | `echo 'sin dependencias'` |
| Start Command | `python server.py` |
| Plan | **Free** |

6. Pulsa **"Advanced"** → **"Add Environment Variable"**:

| Clave | Valor |
|---|---|
| `DEEPSEEK_API_KEY` | `sk-...` (tu clave) |
| `DEEPSEEK_MODEL` | `deepseek-chat` |

7. Pulsa **"Create Web Service"**
8. Espera 2-3 minutos (build + deploy)

✅ Te da una URL: **`https://neoia.onrender.com`**

---

## PASO 3 — Probar

Abre en el navegador:

| URL | Qué debe pasar |
|---|---|
| `https://neoia.onrender.com/` | Ver el chat |
| `https://neoia.onrender.com/api/status` | JSON con `"cloud": true` |
| `https://neoia.onrender.com/landing.html` | La página de venta |

Escribe "hola" en el chat → debe responder. ✅

---

## PASO 4 — (Opcional) Tu dominio propio

**Opción gratis:** `neoia.onrender.com` ya sirve.

**Con dominio propio** (ej. `neoia.app`, ~$12/año):
1. Compra el dominio (Namecheap, Cloudflare, Google Domains)
2. En Render → tu servicio → **Settings → Custom Domain**
3. Añade `neoia.app`
4. En tu proveedor de dominio, crea el registro CNAME que te indique Render
5. Espera 5-30 minutos

---

## ⚠️ Limitaciones del plan GRATIS de Render

| Limitación | Qué significa |
|---|---|
| Se duerme a los **15 min** sin uso | La primera visita tarda ~30 seg en despertar |
| **750 horas**/mes | Suficiente para 1 servicio 24/7 |
| Base de datos SQLite **se borra** al redesplegar | ⚠️ Los planes/usuarios se pierden |

**Solución para datos:** usa **Render PostgreSQL** (gratis 90 días) o **Supabase** (gratis permanente).

---

## 🔄 Actualizar el servicio

Cada vez que cambies el código:

```powershell
git add .
git commit -m "mejora X"
git push
```

Render detecta el push y **redespliega solo**. 🎉

---

## 💰 Costos reales de operar

| Concepto | Costo mensual |
|---|---|
| Render (free) | $0 |
| DeepSeek (100 usuarios activos) | ~$5-15 |
| Dominio (opcional) | ~$1 |
| **Total mínimo** | **~$5-15/mes** |

**Regla:** cobra antes de gastar. Con 2 clientes Pro ($18) ya cubres los costos.

---

## ✅ Checklist final

- [ ] Código en GitHub
- [ ] Servicio creado en Render
- [ ] Variables de entorno configuradas
- [ ] `/api/status` responde
- [ ] El chat responde
- [ ] El landing carga
- [ ] Probado desde el celular (con datos, no WiFi)
