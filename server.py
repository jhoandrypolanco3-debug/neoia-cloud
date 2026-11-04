#!/usr/bin/env python3
# =============================================================
# NeoIA - servidor para la NUBE (Render / Railway / Fly.io)
# Version SEGURA: SOLO chat, imagenes, busqueda y planes.
# NO tiene acceso a archivos, comandos ni a la PC del usuario.
# Solo biblioteca estandar de Python (no requiere pip install).
# =============================================================
import json, os, re, sys, sqlite3, urllib.request, urllib.parse, base64, time, secrets, hashlib, hmac
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timedelta

from core import router as core_router
from core import agents as core_agents
from core.providers import ProviderError

VERSION = "2.0-core"
PORT = int(os.environ.get("PORT", 8080))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "neoia-admin-2026").strip()
ADMIN_TOKENS = {}          # token -> epoch de expiracion
ADMIN_TTL = 30 * 60        # 30 minutos
SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "30"))
SESSION_TOUCH = 3600       # actualiza last_used como mucho 1 vez por hora
RATE = {}                  # ip -> [timestamps]
RATE_LIMIT = 30            # peticiones
RATE_WINDOW = 60           # por minuto, por IP
MAX_BODY = 64 * 1024       # 64 KB maximo por peticion
MAX_MSG = 4000             # caracteres maximos por mensaje
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

# Cabeceras de seguridad aplicadas a todas las respuestas.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; "
        "frame-ancestors 'none'"
    ),
}
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "neoia.db"))

SYSTEM = (
    "Eres NeoIA, programador lider y mentor de elite de FTC para el equipo BIOBUZZ 24096 (temporada BIOBUZZ). "
    "El usuario programa su robot en Android Studio y tu generas codigo Java de clase mundial COMPLETO que compila sin errores a la primera.\n\n"
    "ARQUITECTURA OFICIAL DEL ROBOT BIOBUZZ 24096:\n"
    "1. CHASIS MECANUM (4 Motores DcMotor):\n"
    "   - Nombres hardwareMap: 'frontLeft', 'frontRight', 'backLeft', 'backRight'.\n"
    "   - Sentidos: frontLeft y backLeft en REVERSE, frontRight y backRight en FORWARD.\n"
    "   - Freno: ZeroPowerBehavior.BRAKE en todos.\n"
    "   - Cinematica: y = -gamepad1.left_stick_y, x = gamepad1.left_stick_x * 1.1, rx = gamepad1.right_stick_x.\n"
    "   - Deadband: 0.05. Normalizacion de denominador obligatoria.\n"
    "2. SHOOTER DE ALTA VELOCIDAD (DcMotorEx):\n"
    "   - Nombre hardwareMap: 'shooter'. Con encoder RUN_USING_ENCODER y ZeroPowerBehavior.FLOAT.\n"
    "   - Velocidad base: 1200 ticks/s (BASE_SHOOTER_VELOCITY), maximo 2000 ticks/s (MAX_SHOOTER_VELOCITY).\n"
    "   - Control TeleOp: gamepad1.right_trigger > 0.05 -> shooter.setVelocity(1200.0), gamepad1.left_trigger > 0.05 -> shooter.setPower(0.0).\n"
    "3. INTAKE DE RECOLECCION (DcMotor):\n"
    "   - Nombre hardwareMap: 'intake'. ZeroPowerBehavior.BRAKE, potencia 0.9 (INTAKE_POWER).\n"
    "   - Control TeleOp: gamepad1.a -> tragar (0.9), gamepad1.b -> expulsar/reversa (-0.9), soltar -> 0.0.\n"
    "4. TRANSFER / FEEDER (DcMotor opcional):\n"
    "   - Nombre hardwareMap: 'transferMotor' o 'transfer'.\n"
    "5. VISION Y SENSORES:\n"
    "   - Limelight 3A: nombre 'limelight'. Auto-aim con tx y ganancia AUTO_AIM_KP = 0.035.\n"
    "   - IMU: nombre 'imu'.\n"
    "6. AUTONOMOS Y PATHING:\n"
    "   - Rutas simples: avance por tiempo o encoder, pre-carga disparada con shooter a 1700 ticks/s alimentada por intake durante 2.0s.\n"
    "   - Rutas curvas: biblioteca personalizada 'org.jhoandri.pathing' con JhoandriFollower, Pose y BezierLine.\n\n"
    "REGLAS ESTRICTAS DE ENTREGA:\n"
    "1) Genera codigo COMPLETO y directo dentro de un bloque `java sin omitir metodos ni colocar '// TODO'.\n"
    "2) Paquete: siempre 'package org.firstinspires.ftc.teamcode;' (o 'org.jhoandri.pathing' si aplica).\n"
    "3) Nombres de dispositivos exactos para evitar el error 'Unable to find device' en el Driver Station.\n"
    "4) Prioriza maxima velocidad de respuesta y claridad para el equipo BIOBUZZ 24096."
)
PLAN_PRICES = {"free": 0, "pro": 9, "team": 29}

# ---------------- Seguridad (tokens y limites) ----------------
def admin_ok(token):
    """True si el token de admin existe y no expiro."""
    tok = (token or "").strip()
    exp = ADMIN_TOKENS.get(tok)
    if not exp:
        return False
    if exp < time.time():
        ADMIN_TOKENS.pop(tok, None)
        return False
    return True

def admin_add(token):
    now = time.time()
    for k in [k for k, v in ADMIN_TOKENS.items() if v < now]:
        ADMIN_TOKENS.pop(k, None)
    ADMIN_TOKENS[token] = now + ADMIN_TTL

def rate_ok(ip):
    """Limite simple de peticiones por IP y minuto."""
    now = time.time()
    arr = [t for t in RATE.get(ip, []) if now - t < RATE_WINDOW]
    if len(arr) >= RATE_LIMIT:
        RATE[ip] = arr
        return False
    arr.append(now)
    RATE[ip] = arr
    return True

_SCHEMA_READY = False

def db():
    global _SCHEMA_READY
    c = sqlite3.connect(DB_PATH)
    c.execute("CREATE TABLE IF NOT EXISTS memory (key TEXT PRIMARY KEY, value TEXT)")
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE,
        pass_hash TEXT, name TEXT, created_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT,
        created_at TEXT, updated_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, conv_id INTEGER, role TEXT,
        content TEXT, created_at TEXT)""")
    # Migracion ligera: columna para expirar sesiones. Se ejecuta una sola vez.
    if not _SCHEMA_READY:
        try:
            c.execute("ALTER TABLE sessions ADD COLUMN last_used TEXT")
        except sqlite3.OperationalError:
            pass
        _SCHEMA_READY = True
    c.commit(); return c

# ---------------- Cuentas de usuario ----------------
def now_iso():
    return datetime.utcnow().isoformat(timespec="seconds")

def hash_password(pwd):
    salt = secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pwd.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return salt + "$" + h

def check_password(pwd, stored):
    try:
        salt, h = (stored or "").split("$", 1)
        calc = hashlib.pbkdf2_hmac("sha256", pwd.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
        return hmac.compare_digest(calc, h)
    except Exception:
        return False

def auth_user(handler):
    """Devuelve (id, email, nombre) si el token es valido y no ha expirado."""
    tok = (handler.headers.get("X-Auth-Token") or "").strip()
    if not tok: return None
    c = db()
    r = c.execute("SELECT u.id,u.email,u.name,s.created_at,s.last_used FROM sessions s "
                  "JOIN users u ON u.id=s.user_id WHERE s.token=?", (tok,)).fetchone()
    if not r:
        c.close(); return None

    uid, email, name, created, last_used = r
    ref = last_used or created
    try:
        ref_dt = datetime.fromisoformat(ref)
    except Exception:
        ref_dt = datetime.utcnow()

    # Sesion caducada: se borra y se rechaza.
    if datetime.utcnow() - ref_dt > timedelta(days=SESSION_TTL_DAYS):
        try:
            c.execute("DELETE FROM sessions WHERE token=?", (tok,)); c.commit()
        except Exception:
            pass
        c.close()
        return None

    # Toque perezoso: no escribir en cada peticion.
    try:
        stale = (not last_used) or (
            (datetime.utcnow() - datetime.fromisoformat(last_used)).total_seconds() > SESSION_TOUCH)
        if stale:
            c.execute("UPDATE sessions SET last_used=? WHERE token=?", (now_iso(), tok)); c.commit()
    except Exception:
        pass

    c.close()
    return (uid, email, name)

def mem_get(k, d=None):
    c = db(); r = c.execute("SELECT value FROM memory WHERE key=?", (k,)).fetchone(); c.close()
    return json.loads(r[0]) if r else d

def mem_set(k, v):
    c = db(); c.execute("INSERT INTO memory(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k, json.dumps(v))); c.commit(); c.close()

def stats_inc(k):
    s = mem_get("stats", {}) or {}; s[k] = s.get(k, 0) + 1; mem_set("stats", s)

# ---------------- IA ----------------
def call_deepseek(messages, task="chat"):
    """Compatibilidad: ahora todo pasa por el router del CORE."""
    return core_router.complete(messages, task=task)

# ---------------- Busqueda (multi-fuente con respaldo) ----------------
STOP = {"cuando","cuÃ¡ndo","es","el","la","los","las","un","una","de","del","que","quÃ©","como","cÃ³mo",
        "cuanto","cuÃ¡nto","donde","dÃ³nde","quien","quiÃ©n","por","para","en","y","o","a","al","se",
        "su","sus","mi","me","te","lo","le","les","nos","hoy","ahora","proximo","prÃ³ximo","proxima",
        "prÃ³xima","sera","serÃ¡","cual","cuÃ¡l","hay","vas","va","tiene","tienen","puedo","puede"}

def search_query(text):
    """Convierte una pregunta en una consulta corta de busqueda."""
    words = re.findall(r"[\wÃ¡Ã©Ã­Ã³ÃºÃ±Ã¼]+", (text or "").lower())
    keep = [w for w in words if w not in STOP and len(w) > 2]
    return " ".join(keep[:12]) or (text or "")[:80]

def _clean_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()

def _search_ddg_post(q, n=6):
    data = urllib.parse.urlencode({"q": q, "b": "", "kl": "es-es"}).encode()
    req = urllib.request.Request("https://html.duckduckgo.com/html/", data=data, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "es-ES,es;q=0.9"})
    html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    links = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.S)
    snips = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.S)
    out = []
    for i, (href, t) in enumerate(links[:n]):
        tt = _clean_html(t)
        if tt:
            out.append({"title": tt, "url": href, "snippet": _clean_html(snips[i]) if i < len(snips) else ""})
    return out

def _search_ddg_lite(q, n=6):
    url = "https://lite.duckduckgo.com/lite/?q=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
    links = re.findall(r"<a[^>]+class=['\"]result-link['\"][^>]*>(.*?)</a>", html, re.S)
    hrefs = re.findall(r"<a[^>]+href=['\"]([^'\"]+)['\"][^>]*class=['\"]result-link['\"]", html)
    snips = re.findall(r"<td[^>]+class=['\"]result-snippet['\"][^>]*>(.*?)</td>", html, re.S)
    out = []
    for i, t in enumerate(links[:n]):
        tt = _clean_html(t)
        if tt:
            out.append({"title": tt, "url": hrefs[i] if i < len(hrefs) else "",
                        "snippet": _clean_html(snips[i]) if i < len(snips) else ""})
    return out

def _search_bing(q, n=6):
    url = "https://www.bing.com/search?q=" + urllib.parse.quote(q) + "&setlang=es"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
    out = []
    for b in re.findall(r'<li class="b_algo".*?</li>', html, re.S)[:n]:
        m = re.search(r'<h2[^>]*>(.*?)</h2>', b, re.S)
        h = re.search(r'<a[^>]+href="([^"]+)"', b)
        p = re.search(r'<p[^>]*>(.*?)</p>', b, re.S)
        if m:
            out.append({"title": _clean_html(m.group(1)), "url": h.group(1) if h else "",
                        "snippet": _clean_html(p.group(1)) if p else ""})
    return out

def _search_wiki(q, n=3):
    url = ("https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch="
           + urllib.parse.quote(q) + "&format=json&srlimit=" + str(n))
    req = urllib.request.Request(url, headers={"User-Agent": "NeoIA/1.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8"))
    out = []
    for x in (d.get("query", {}).get("search") or [])[:n]:
        out.append({"title": x.get("title", ""),
                    "url": "https://es.wikipedia.org/wiki/" + urllib.parse.quote((x.get("title") or "").replace(" ", "_")),
                    "snippet": _clean_html(x.get("snippet", ""))})
    return out

def _search_ddg_api(q, n=3):
    """API oficial de DuckDuckGo (no la bloquean como a las paginas)."""
    url = ("https://api.duckduckgo.com/?q=" + urllib.parse.quote(q)
           + "&format=json&no_html=1&skip_disambig=1")
    req = urllib.request.Request(url, headers={"User-Agent": "NeoIA/1.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8"))
    out = []
    if d.get("AbstractText"):
        out.append({"title": d.get("Heading") or q, "url": d.get("AbstractURL", ""),
                    "snippet": d["AbstractText"]})
    for t in (d.get("RelatedTopics") or []):
        if isinstance(t, dict) and t.get("Text"):
            out.append({"title": t["Text"][:80], "url": t.get("FirstURL", ""), "snippet": t["Text"][:220]})
    return out[:n]

def _relevant(results, query):
    """True si al menos algunos resultados contienen palabras de la consulta."""
    words = [w for w in re.findall(r"\w+", (query or "").lower()) if len(w) > 3]
    if not words or not results:
        return bool(results)
    hits = 0
    for r in results:
        blob = ((r.get("title") or "") + " " + (r.get("snippet") or "")).lower()
        if any(w in blob for w in words):
            hits += 1
    return hits >= max(1, len(results) // 3)

def web_search(q, n=6):
    """Prueba fuentes; descarta las que devuelvan resultados irrelevantes."""
    # 1) Primera pasada: solo fuentes con resultados relevantes
    for fn in (_search_ddg_post, _search_ddg_lite, _search_bing, _search_ddg_api, _search_wiki):
        try:
            res = fn(q)
            if res and _relevant(res, q):
                return res[:n]
        except Exception:
            continue
    # 2) Si ninguna fue relevante, usar la primera que devuelva algo
    for fn in (_search_ddg_api, _search_bing, _search_ddg_post, _search_wiki):
        try:
            res = fn(q)
            if res:
                return res[:n]
        except Exception:
            continue
    return []

# ---------------- Deteccion de preguntas que necesitan internet ----------------
NEEDS_WEB = re.compile(
    r"\b(cu[aÃ¡]ndo|cu[aÃ¡]nto|cu[aÃ¡]l es el|pr[oÃ³]xim[oa]s?|hoy|ahora|actual(es)?|actualmente|"
    r"noticias?|resultados?|gan[oÃ³]|ganador|precio|cotizaci[oÃ³]n|clima|partidos?|calendario|"
    r"fecha|qui[eÃ©]n (es|fue|gan)|temporada|estreno|reciente|ultimo|Ãºltimo|2026|2027)\b", re.I)

def chat_answer(msgs, agent_id=None):
    """Responde SIEMPRE; si la pregunta es de actualidad, busca en internet primero."""
    last = ""
    if msgs:
        try: last = msgs[-1].get("content") or ""
        except Exception: last = ""
    sysp = core_agents.system_for(agent_id, SYSTEM)
    if last and NEEDS_WEB.search(last):
        try:
            res = web_search(search_query(last), 6)
            if res:
                ctx = "\n".join("- %s | %s | %s" % (r["title"], r["snippet"], r["url"]) for r in res)
                sysp = (SYSTEM + "\n\n=== DATOS ACTUALES DE INTERNET (consulta: " + last[:80] + ") ===\n"
                        + ctx +
                        "\n\nUsa estos datos para responder con la fecha/dato real. "
                        "Si los datos no alcanzan, dilo y sugiere una fuente.")
        except Exception:
            pass
    return core_router.complete([{"role": "system", "content": sysp}] + msgs,
                                task=core_agents.task_for(agent_id, "chat"))

# ---------------- Imagenes ----------------
def make_image(prompt, w=512, h=512):
    """Pollinations con 'referrer' (obligatorio ahora) + variantes y reintentos rapidos."""
    base = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
    last = ""
    # turbo suele ser mas rapido; el resto son reintentos con seed distinta
    variantes = [True, False, True, False]
    for i, turbo in enumerate(variantes):
        try:
            seed = int(time.time() * 1000) % 1000000 + i * 7
            extra = "&model=turbo" if turbo else ""
            url = ("%s?width=%d&height=%d&nologo=true&seed=%d&referrer=neoia%s"
                   % (base, w, h, seed, extra))
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) NeoIA"})
            data = urllib.request.urlopen(req, timeout=40).read()
            if len(data) >= 1000:
                mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
                return "data:%s;base64,%s" % (mime, base64.b64encode(data).decode())
            last = "respuesta vacia"
        except Exception as e:
            last = str(e)
        time.sleep(1)
    raise RuntimeError("El generador de imagenes no responde ahora. Intenta de nuevo en un minuto.")

# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    def _secure_headers(self):
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self._secure_headers()
        self.end_headers(); self.wfile.write(b)

    def _body(self):
        """Lee el JSON del cuerpo. Devuelve None si es demasiado grande."""
        try: n = int(self.headers.get("Content-Length", 0) or 0)
        except Exception: n = 0
        if n > MAX_BODY:
            try: self.rfile.read(n)
            except Exception: pass
            return None
        if n <= 0: return {}
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return {}

    def _static(self, path):
        if path in ("/", "/index.html"):
            name = "landing.html"
        elif path in ("/chat", "/app", "/console"):
            name = "chat.html"
        else:
            name = path.lstrip("/")
        p = os.path.join(PUBLIC, name)
        if not os.path.abspath(p).startswith(os.path.abspath(PUBLIC)) or not os.path.isfile(p):
            self.send_error(404); return
        ext = os.path.splitext(p)[1].lower()
        mime = {".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
                ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
                ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"}.get(ext, "text/plain")
        b = open(p, "rb").read()
        self.send_response(200); self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(b)))
        self._secure_headers()
        self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); r = u.path
        if r.startswith("/api/") and not rate_ok(self.client_address[0]):
            return self._json(429, {"error": "Demasiadas peticiones. Espera un momento."})
        if r == "/api/status":
            self._json(200, {"name": "NeoIA", "version": VERSION, "cloud": True,
                             "providerConfigured": core_router.resolve("chat")[0].configured,
                             "model": DEEPSEEK_MODEL, "plan": mem_get("plan", "free")})
        elif r == "/api/agents":
            self._json(200, {"agents": core_agents.public_list()})
        elif r == "/api/plan-info":
            self._json(200, {"plan": mem_get("plan", "free"), "prices": PLAN_PRICES})
        elif r == "/api/stats":
            if not admin_ok(self.headers.get("X-Admin-Token")):
                return self._json(401, {"error": "No autorizado"})
            self._json(200, mem_get("stats", {}))
        elif r == "/api/admin":
            if not admin_ok(self.headers.get("X-Admin-Token")):
                return self._json(401, {"error": "No autorizado"})
            self._json(200, {
                "plan": mem_get("plan", "free"),
                "prices": PLAN_PRICES,
                "stats": mem_get("stats", {}),
                "version": VERSION,
                "provider": bool(DEEPSEEK_API_KEY),
                "model": DEEPSEEK_MODEL,
                "providers": core_router.status(),
                "agents": core_agents.public_list(),
            })
        elif r == "/api/me":
            u2 = auth_user(self)
            if not u2: return self._json(401, {"error": "Inicia sesion"})
            self._json(200, {"user": {"id": u2[0], "email": u2[1], "name": u2[2]}})
        elif r == "/api/conversations":
            u2 = auth_user(self)
            if not u2: return self._json(401, {"error": "Inicia sesion"})
            c = db()
            rows = c.execute("SELECT id,title,updated_at FROM conversations WHERE user_id=? ORDER BY id DESC LIMIT 50", (u2[0],)).fetchall()
            c.close()
            self._json(200, {"conversations": [{"id": x[0], "title": x[1], "updated": x[2]} for x in rows]})
        elif r == "/api/conversation":
            u2 = auth_user(self)
            if not u2: return self._json(401, {"error": "Inicia sesion"})
            q = urllib.parse.parse_qs(u.query)
            try: cid = int((q.get("id") or ["0"])[0] or 0)
            except Exception: cid = 0
            c = db()
            row = c.execute("SELECT id,title FROM conversations WHERE id=? AND user_id=?", (cid, u2[0])).fetchone()
            if not row:
                c.close(); return self._json(404, {"error": "Conversacion no encontrada"})
            msgs2 = c.execute("SELECT role,content FROM messages WHERE conv_id=? ORDER BY id", (cid,)).fetchall()
            c.close()
            self._json(200, {"id": row[0], "title": row[1],
                             "messages": [{"role": m[0], "content": m[1]} for m in msgs2]})
        else:
            self._static(r)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path); r = u.path
        if r.startswith("/api/") and not rate_ok(self.client_address[0]):
            return self._json(429, {"error": "Demasiadas peticiones. Espera un momento."})
        body = self._body()
        if body is None:
            return self._json(413, {"error": "La peticion es demasiado grande."})
        if r in ("/api/chat", "/api/ai", "/api/agent"):
            msgs = body.get("messages")
            if not isinstance(msgs, list) or not msgs:
                m = (body.get("message") or "").strip()
                if not m: return self._json(400, {"error": "Escribe un mensaje."})
                if len(m) > MAX_MSG:
                    return self._json(400, {"error": "El mensaje es demasiado largo (maximo %d caracteres)." % MAX_MSG})
                msgs = [{"role": "user", "content": m}]
            else:
                limpio = []
                for x in msgs[-14:]:
                    if not isinstance(x, dict): continue
                    rol = x.get("role")
                    if rol not in ("user", "assistant", "system"): continue
                    cont = str(x.get("content") or "")[:MAX_MSG]
                    if cont.strip():
                        limpio.append({"role": rol, "content": cont})
                if not limpio:
                    return self._json(400, {"error": "Mensaje invalido."})
                msgs = limpio
            try:
                rep = chat_answer(msgs, body.get("agent"))
                stats_inc("chat")
                # Guardar la conversacion si el usuario inicio sesion
                cid = 0
                u2 = auth_user(self)
                if u2:
                    user_text = (msgs[-1].get("content") or "") if msgs else ""
                    c = db()
                    try: cid = int(body.get("conversation_id") or 0)
                    except Exception: cid = 0
                    if cid:
                        owner = c.execute("SELECT id FROM conversations WHERE id=? AND user_id=?", (cid, u2[0])).fetchone()
                        if not owner: cid = 0
                    if not cid:
                        title = user_text.strip().replace("\n", " ")[:60] or "Nueva conversacion"
                        cur = c.execute("INSERT INTO conversations(user_id,title,created_at,updated_at) VALUES(?,?,?,?)",
                                        (u2[0], title, now_iso(), now_iso()))
                        cid = cur.lastrowid
                    c.execute("INSERT INTO messages(conv_id,role,content,created_at) VALUES(?,?,?,?)", (cid, "user", user_text, now_iso()))
                    c.execute("INSERT INTO messages(conv_id,role,content,created_at) VALUES(?,?,?,?)", (cid, "assistant", rep, now_iso()))
                    c.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now_iso(), cid))
                    c.commit(); c.close()
                self._json(200, {"reply": rep, "conversation_id": cid})
            except ProviderError as e:
                # Mensaje ya curado: es seguro mostrarlo.
                print("ERROR proveedor:", type(e).__name__, file=sys.stderr)
                self._json(503, {"error": str(e)})
            except Exception as e:
                print("ERROR chat:", type(e).__name__, file=sys.stderr)
                self._json(502, {"reply": "La IA no respondio a tiempo. Intenta de nuevo en unos segundos."})
        elif r == "/api/auth/register":
            email = (body.get("email") or "").strip().lower()
            pwd = (body.get("password") or "").strip()
            name = (body.get("name") or "").strip() or email.split("@")[0]
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                return self._json(400, {"error": "Email invalido"})
            if len(pwd) < 6:
                return self._json(400, {"error": "La contrasena debe tener al menos 6 caracteres"})
            c = db()
            try:
                c.execute("INSERT INTO users(email,pass_hash,name,created_at) VALUES(?,?,?,?)",
                          (email, hash_password(pwd), name, now_iso()))
                c.commit()
            except sqlite3.IntegrityError:
                c.close(); return self._json(400, {"error": "Ese email ya esta registrado"})
            uid = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()[0]
            tok = secrets.token_hex(24)
            c.execute("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)", (tok, uid, now_iso()))
            c.commit(); c.close()
            stats_inc("register")
            self._json(200, {"token": tok, "user": {"id": uid, "email": email, "name": name}})
        elif r == "/api/auth/login":
            email = (body.get("email") or "").strip().lower()
            pwd = (body.get("password") or "").strip()
            c = db()
            row = c.execute("SELECT id,pass_hash,name FROM users WHERE email=?", (email,)).fetchone()
            if not row or not check_password(pwd, row[1]):
                c.close(); return self._json(401, {"error": "Email o contrasena incorrectos"})
            tok = secrets.token_hex(24)
            c.execute("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)", (tok, row[0], now_iso()))
            c.commit(); c.close()
            self._json(200, {"token": tok, "user": {"id": row[0], "email": email, "name": row[2]}})
        elif r == "/api/auth/logout":
            tok = (self.headers.get("X-Auth-Token") or "").strip()
            c = db(); c.execute("DELETE FROM sessions WHERE token=?", (tok,)); c.commit(); c.close()
            self._json(200, {"ok": True})
        elif r == "/api/conversation/delete":
            u2 = auth_user(self)
            if not u2: return self._json(401, {"error": "Inicia sesion"})
            try: cid = int(body.get("id") or 0)
            except Exception: cid = 0
            c = db()
            c.execute("DELETE FROM messages WHERE conv_id=?", (cid,))
            c.execute("DELETE FROM conversations WHERE id=? AND user_id=?", (cid, u2[0]))
            c.commit(); c.close()
            self._json(200, {"ok": True})
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
                print("ERROR imagen:", type(e).__name__, file=sys.stderr)
                self._json(500, {"error": "No se pudo generar la imagen ahora. Intenta de nuevo."})
        elif r == "/api/admin/login":
            pwd = (body.get("password") or "").strip()
            if not pwd or not hmac.compare_digest(pwd, ADMIN_PASSWORD):
                return self._json(401, {"error": "Contrasena incorrecta"})
            tok = secrets.token_hex(16)
            admin_add(tok)
            self._json(200, {"token": tok})
        elif r in ("/api/plan", "/api/admin/plan"):
            if not admin_ok(self.headers.get("X-Admin-Token")):
                return self._json(401, {"error": "Solo el administrador puede cambiar el plan."})
            p = (body.get("plan") or "").lower()
            if p not in PLAN_PRICES: return self._json(400, {"error": "Plan invalido."})
            mem_set("plan", p); stats_inc("plan_change")
            self._json(200, {"ok": True, "plan": p})
        else:
            self._json(404, {"error": "No encontrado"})

    def log_message(self, fmt, *args):
        pass  # silencio en produccion

# ---------------- Registro de agentes del CORE ----------------
core_agents.register(core_agents.Agent(
    id="general",
    name="NeoIA",
    description="Asistente general con especialidad en FIRST Tech Challenge",
    task="chat",
    system=SYSTEM,
))

if __name__ == "__main__":
    _p = core_router.resolve("chat")[0]
    print("NeoIA %s en puerto %d | proveedor: %s | configurado: %s"
          % (VERSION, PORT, _p.name, "SI" if _p.configured else "NO"))
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
