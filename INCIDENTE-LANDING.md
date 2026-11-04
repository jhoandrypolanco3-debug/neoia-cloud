# INFORME DE INCIDENTE — Landing sin estilos

**Sistema:** NeoIA (`https://neoia-351a.onrender.com`)
**Fecha:** 3 de noviembre de 2026
**Severidad:** Alta — la página pública se veía rota para todos los visitantes
**Estado:** Corregido en el repositorio. **Pendiente de despliegue.**

---

## 1. RESUMEN

La página principal de marketing (`/landing.html`) se mostró sin estilos: texto plano,
enlaces azules subrayados, fondo negro. El contenido era legible pero la página
transmitía abandono total.

Hubo **dos causas encadenadas**:

1. La landing dependía de dos CDN externos para cargar su diseño.
2. Las cabeceras de seguridad que se desplegaron después **bloquean** esos CDN.

La segunda convirtió un fallo intermitente en un fallo total.

---

## 2. CRONOLOGÍA

| Hora | Evento |
|---|---|
| 18:09 | Se publica una nueva web corporativa (`1a928cb`) que carga Tailwind y Lucide desde CDN externos |
| 21:08 | Se despliega el núcleo modular con CSP (`e69b9e9`) |
| 21:11 | El propietario reporta la landing sin estilos (captura de pantalla) |
| 21:15 | Se corrigen los CDN y se publica el arreglo (`c341688`) |
| — | **El arreglo aún no está desplegado en Render** |

---

## 3. CAUSA RAÍZ

### 3.1 Dependencia externa para algo crítico

La landing usa Tailwind mediante su compilador en JavaScript:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
```

Tailwind genera el CSS **en el navegador del visitante**. Si ese script no llega,
no hay CSS: la página no tiene estilos propios de respaldo.

### 3.2 El CSP los bloquea por diseño

La nueva política de seguridad incluye:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

`'self'` significa: **solo recursos del propio dominio**. Los dos CDN externos
quedaron bloqueados en cuanto esa cabecera entró en producción.

Consecuencia: lo que antes fallaba según la suerte de la red, pasó a fallar
siempre, para todos.

### 3.3 Fallo de proceso (mío)

Antes de implementar el CSP comprobé que las páginas no usaran recursos externos.
**Esa comprobación se hizo sobre la versión antigua de la landing.** Minutos antes,
otra sesión de trabajo había reemplazado ese archivo por completo.

El repositorio remoto tenía 8 commits nuevos que no estaban en mi copia local.
Cuando hice el rebase, la landing cambió, pero **no repetí la verificación**.

Esta es la causa de fondo: **verifiqué una vez y asumí que seguía siendo cierto.**

---

## 4. IMPACTO

| Aspecto | Impacto |
|---|---|
| Visitantes de la landing | Página sin estilos, percepción de producto abandonado |
| Funcionalidad de la app (`/`) | **Ninguna** — el chat nunca se vio afectado |
| Registro / login | **Ninguno** |
| SEO | Negativo temporal: Google podría indexar la versión rota |
| Datos | **Ninguna pérdida** |

---

## 5. QUÉ SE HIZO PARA CORREGIRLO

Se descargaron ambos archivos y ahora se sirven desde el propio dominio:

```
public/vendor/tailwind.js    398 KB
public/vendor/lucide.js      466 KB
```

```html
<script src="/vendor/tailwind.js"></script>
<script src="/vendor/lucide.js"></script>
```

**Ventajas:**

- La página ya no depende de ningún servicio externo.
- Convive con el CSP sin relajarlo.
- Carga aunque la red del visitante sea lenta o el CDN esté caído.

**Verificación realizada:** se sirvió la página con el servidor real (CSP activo)
y se capturó en un navegador: estilos, iconos, tarjetas y las secciones inferiores
renderizan correctamente.

---

## 6. MEDIDAS PARA QUE NO SE REPITA

### 6.1 Prueba automática (pendiente de añadir al test de humo)

Detectar en todas las páginas cualquier recurso externo:

```python
# falla si alguna pagina depende de un dominio ajeno
for pagina in ["landing.html", "chat.html", "admin.html"]:
    assert 'src="http' not in contenido(pagina)
```

### 6.2 Regla del proyecto

> **Ninguna página puede depender de un dominio externo para verse bien.**

Si se necesita una librería, se guarda en `public/vendor/`.

### 6.3 Verificación antes de desplegar

Cada despliegue debe comprobar, como mínimo:

1. `/api/status` responde con la versión esperada.
2. `/landing.html` carga **con** estilos.
3. `/vendor/tailwind.js` responde `200`.

---

## 7. DEUDA TÉCNICA ABIERTA

La corrección funciona, pero **no es óptima**: Tailwind compila el CSS en el
navegador de cada visitante (798 KB de JavaScript por visita).

La solución definitiva es generar el CSS una vez (≈15 KB estáticos) y servir un
`.css` normal. Está pendiente.

---

## 8. LECCIÓN

Un cambio de seguridad puede romper el producto aunque el cambio sea correcto.
**Las cabeceras se diseñan para bloquear; por eso hay que verificar en un
navegador real, no en el código.**

Y más importante: una verificación hecha hace una hora, cuando el equipo trabaja
en paralelo, ya no vale.
