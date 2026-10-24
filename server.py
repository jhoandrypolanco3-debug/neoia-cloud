#!/usr/bin/env python3
# =============================================================
# NeoIA - servidor para la NUBE (Render / Railway / Fly.io)
# Version SEGURA: SOLO chat, imagenes, busqueda y planes.
# NO tiene acceso a archivos, comandos ni a la PC del usuario.
# Solo biblioteca estandar de Python (no requiere pip install).
# =============================================================
import json, os, re, sqlite3, urllib.request, urllib.parse, base64, time, secrets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime

VERSION = "1.2-admin"
PORT = int(os.environ.get("PORT", 8080))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "neoia-admin-2026").strip()
ADMIN_TOKENS = set()   # sesiones activas del panel admin
PORT = int(os.environ.get("PORT", 8080))
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "neoia.db"))

SYSTEM = ("Eres NeoIA, un asistente de IA general. Puedes responder CUALQUIER pregunta: "
          "ciencia, historia, matematicas, programacion, cocina, salud, consejos, robotica, cultura general, etc. "
          "Responde en espanol, claro, util y directo. "
          "Si la pregunta es sobre FIRST Tech Challenge (FTC) o robotica, eres experto en el SDK de FTC "
          "(com.qualcomm.robotcore...) y das codigo Java real en bloques ```java. "
          "Si no sabes algo, dilo con honestidad. No inventes datos ni APIs.")

PLAN_PRICES = {"free": 0, "pro": 9, "team": 29}

def db():
    c = sqlite3.connect(DB_PATH)
    c.execute("CREATE TABLE IF NOT EXISTS memory (key TEXT PRIMARY KEY, value TEXT)")
    c.commit(); return c

def mem_get(k, d=None):
    c = db(); r = c.execute("SELECT value FROM memory WHERE key=?", (k,)).fetchone(); c.close()
    return json.loads(r[0]) if r else d

def mem_set(k, v):
    c = db(); c.execute("INSERT INTO memory(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k, json.dumps(v))); c.commit(); c.close()

def stats_inc(k):
    s = mem_get("stats", {}) or {}; s[k] = s.get(k, 0) + 1; mem_set("stats", s)

# ---------------- IA ----------------
def call_deepseek(messages):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("Falta DEEPSEEK_API_KEY en las variables de entorno")
    body = {"model": DEEPSEEK_MODEL, "messages": messages, "temperature": 0.5, "max_tokens": 1500}
    req = urllib.request.Request(DEEPSEEK_URL, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + DEEPSEEK_API_KEY})
    data = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]

# ---------------- Busqueda (DuckDuckGo Lite) ----------------
def web_search(q, n=6):
    try:
        url = "https://lite.duckduckgo.com/lite/?q=" + urllib.parse.quote(q)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
        links = re.findall(r"<a[^>]+class=['\"]result-link['\"][^>]*>(.*?)</a>", html, re.S)
        hrefs = re.findall(r"<a[^>]+href=['\"]([^'\"]+)['\"][^>]*class=['\"]result-link['\"]", html)
        snips = re.findall(r"<td[^>]+class=['\"]result-snippet['\"][^>]*>(.*?)</td>", html, re.S)
        out = []
        for i, t in enumerate(links[:n]):
            titulo = re.sub(r"<[^>]+>", "", t).strip()
            frag = re.sub(r"<[^>]+>", "", snips[i]).strip() if i < len(snips) else ""
            if titulo:
                out.append({"title": titulo, "url": hrefs[i] if i < len(hrefs) else "", "snippet": frag})
        return out
    except Exception:
        return []

# ---------------- Deteccion de preguntas que necesitan internet ----------------
NEEDS_WEB = re.compile(
    r"\b(cu[aá]ndo|cu[aá]nto|cu[aá]l es el|pr[oó]xim[oa]s?|hoy|ahora|actual(es)?|actualmente|"
    r"noticias?|resultados?|gan[oó]|ganador|precio|cotizaci[oó]n|clima|partidos?|calendario|"
    r"fecha|qui[eé]n (es|fue|gan)|temporada|estreno|reciente|ultimo|último|2026|2027)\b", re.I)

def chat_answer(msgs):
    """Responde SIEMPRE; si la pregunta es de actualidad, busca en internet primero."""
    last = ""
    if msgs:
        try: last = msgs[-1].get("content") or ""
        except Exception: last = ""
    sysp = SYSTEM
    if last and NEEDS_WEB.search(last):
        try:
            res = web_search(last, 6)
            if res:
                ctx = "\n".join("- %s | %s | %s" % (r["title"], r["snippet"], r["url"]) for r in res)
                sysp = (SYSTEM + "\n\n=== DATOS ACTUALES DE INTERNET (consulta: " + last[:80] + ") ===\n"
                        + ctx +
                        "\n\nUsa estos datos para responder con la fecha/dato real. "
                        "Si los datos no alcanzan, dilo y sugiere una fuente.")
        except Exception:
            pass
    return call_deepseek([{"role": "system", "content": sysp}] + msgs)

# ---------------- Imagenes ----------------
def make_image(prompt, w=768, h=768):
    last = ""
    for attempt in range(4):
        try:
            seed = int(time.time() * 1000) % 1000000 + attempt * 7
            url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt) +
                   "?width=%d&height=%d&nologo=true&seed=%d" % (w, h, seed))
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 NeoIA"})
            data = urllib.request.urlopen(req, timeout=150).read()
            if len(data) >= 1000:
                mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
                return "data:%s;base64,%s" % (mime, base64.b64encode(data).decode())
            last = "respuesta vacia"
        except Exception as e:
            last = str(e)
        time.sleep(4 + attempt * 4)
    raise RuntimeError("Servicio de imagenes saturado: " + last)

# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return {}

    def _static(self, path):
        name = "chat.html" if path == "/" else path.lstrip("/")
        p = os.path.join(PUBLIC, name)
        if not os.path.abspath(p).startswith(os.path.abspath(PUBLIC)) or not os.path.isfile(p):
            self.send_error(404); return
        ext = os.path.splitext(p)[1].lower()
        mime = {".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
                ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
                ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"}.get(ext, "text/plain")
        b = open(p, "rb").read()
        self.send_response(200); self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); r = u.path
        if r == "/api/status":
            self._json(200, {"name": "NeoIA", "cloud": True, "providerConfigured": bool(DEEPSEEK_API_KEY),
                             "model": DEEPSEEK_MODEL, "plan": mem_get("plan", "free")})
        elif r == "/api/plan-info":
            self._json(200, {"plan": mem_get("plan", "free"), "prices": PLAN_PRICES})
        elif r == "/api/stats":
            self._json(200, mem_get("stats", {}))
        elif r == "/api/admin":
            if self.headers.get("X-Admin-Token") not in ADMIN_TOKENS:
                return self._json(401, {"error": "No autorizado"})
            self._json(200, {
                "plan": mem_get("plan", "free"),
                "prices": PLAN_PRICES,
                "stats": mem_get("stats", {}),
                "version": VERSION,
                "provider": bool(DEEPSEEK_API_KEY),
                "model": DEEPSEEK_MODEL,
            })
        else:
            self._static(r)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path); r = u.path; body = self._body()
        if r in ("/api/chat", "/api/ai", "/api/agent"):
            msgs = body.get("messages")
            if not isinstance(msgs, list) or not msgs:
                m = (body.get("message") or "").strip()
                if not m: return self._json(400, {"error": "Escribe un mensaje."})
                msgs = [{"role": "user", "content": m}]
            try:
                rep = chat_answer(msgs)
                stats_inc("chat")
                self._json(200, {"reply": rep})
            except Exception as e:
                self._json(502, {"reply": "Error de IA: " + str(e)})
        elif r == "/api/search":
            res = web_search(body.get("query", "")); stats_inc("search")
            self._json(200, {"results": res})
        elif r == "/api/image":
            prompt = (body.get("prompt") or "").strip()
            if not prompt: return self._json(400, {"error": "Describe la imagen."})
            try:
                img = make_image(prompt); stats_inc("image")
                self._json(200, {"prompt": prompt, "image": img})
            except Exception as e:
                self._json(500, {"error": str(e)})
        elif r == "/api/admin/login":
            pwd = (body.get("password") or "").strip()
            if not pwd or pwd != ADMIN_PASSWORD:
                return self._json(401, {"error": "Contrasena incorrecta"})
            tok = secrets.token_hex(16)
            ADMIN_TOKENS.add(tok)
            self._json(200, {"token": tok})
        elif r in ("/api/plan", "/api/admin/plan"):
            if self.headers.get("X-Admin-Token") not in ADMIN_TOKENS:
                return self._json(401, {"error": "Solo el administrador puede cambiar el plan."})
            p = (body.get("plan") or "").lower()
            if p not in PLAN_PRICES: return self._json(400, {"error": "Plan invalido."})
            mem_set("plan", p); stats_inc("plan_change")
            self._json(200, {"ok": True, "plan": p})
        else:
            self._json(404, {"error": "No encontrado"})

    def log_message(self, fmt, *args):
        pass  # silencio en produccion

if __name__ == "__main__":
    print("NeoIA nube en puerto %d | IA: %s" % (PORT, "SI" if DEEPSEEK_API_KEY else "NO"))
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
