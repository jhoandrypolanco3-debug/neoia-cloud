# -*- coding: utf-8 -*-
"""Test de humo de NeoIA. Sin dependencias: solo biblioteca estandar.

    python tests/smoke.py

Arranca el servidor en un puerto de prueba, con una base de datos temporal,
y verifica el comportamiento real. Devuelve codigo 1 si algo falla.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4477
BASE = "http://127.0.0.1:%d" % PORT
DB = os.path.join(ROOT, ".tmp_test_neoia.db")

ok = 0
fail = 0


def check(nombre, cond, detalle=""):
    global ok, fail
    if cond:
        ok += 1
        print("  [OK]    " + nombre)
    else:
        fail += 1
        print("  [FALLA] " + nombre + ("  -> " + detalle if detalle else ""))


def req(path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers=headers or {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8")


def main():
    if os.path.exists(DB):
        os.remove(DB)

    env = dict(os.environ)
    env["PORT"] = str(PORT)
    env["DB_PATH"] = DB
    env.pop("DEEPSEEK_API_KEY", None)   # probamos el caso "sin proveedor"

    proc = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        # espera de arranque
        listo = False
        for _ in range(40):
            try:
                req("/api/status")
                listo = True
                break
            except Exception:
                time.sleep(0.25)
        check("el servidor arranca", listo)
        if not listo:
            return

        print("\n-- Cabeceras de seguridad --")
        st, hd, body = req("/api/status")
        check("X-Content-Type-Options", hd.get("X-Content-Type-Options") == "nosniff")
        check("X-Frame-Options", hd.get("X-Frame-Options") == "DENY")
        check("Content-Security-Policy", "frame-ancestors" in (hd.get("Content-Security-Policy") or ""))
        check("sin CORS abierto (*)", hd.get("Access-Control-Allow-Origin") is None,
              str(hd.get("Access-Control-Allow-Origin")))
        check("version 2.0-core", '"2.0-core"' in body, body[:120])

        print("\n-- CORE: agentes --")
        st, hd, body = req("/api/agents")
        d = json.loads(body)
        check("GET /api/agents responde 200", st == 200)
        check("incluye el agente general", any(a["id"] == "general" for a in d.get("agents", [])))
        check("no expone el system prompt", "system" not in json.dumps(d))

        print("\n-- CORE: error seguro sin proveedor --")
        st, hd, body = req("/api/chat", "POST", {"message": "hola"})
        check("chat sin clave devuelve 503", st == 503, str(st))
        check("mensaje curado para el usuario", "no esta configurada" in body.lower(), body[:120])
        check("no filtra detalles internos",
              "Traceback" not in body and "deepseek.com" not in body.lower()
              and "api_key" not in body.lower(), body[:120])

        print("\n-- Cuentas y sesiones --")
        email = "test_%d@neoia.local" % int(time.time())
        st, hd, body = req("/api/auth/register", "POST",
                           {"email": email, "password": "secreto123", "name": "Test"})
        tok = json.loads(body).get("token", "") if st == 200 else ""
        check("registro devuelve token", bool(tok), body[:120])

        st, hd, body = req("/api/me", headers={"X-Auth-Token": tok})
        check("/api/me con token valido", st == 200 and email in body, body[:120])

        c = sqlite3.connect(DB)
        cols = [r[1] for r in c.execute("PRAGMA table_info(sessions)")]
        check("columna last_used existe (migracion)", "last_used" in cols, str(cols))

        row = c.execute("SELECT last_used FROM sessions WHERE token=?", (tok,)).fetchone()
        check("last_used se rellena al autenticar", bool(row and row[0]), str(row))
        c.close()

        print("\n-- Expiracion de sesiones --")
        # sesion de 90 dias: debe rechazarse y borrarse
        c = sqlite3.connect(DB)
        viejo = "2020-01-01T00:00:00"
        c.execute("UPDATE sessions SET last_used=?, created_at=? WHERE token=?", (viejo, viejo, tok))
        c.commit(); c.close()
        st, hd, body = req("/api/me", headers={"X-Auth-Token": tok})
        check("sesion caducada devuelve 401", st == 401, str(st))
        c = sqlite3.connect(DB)
        n = c.execute("SELECT COUNT(*) FROM sessions WHERE token=?", (tok,)).fetchone()[0]
        c.close()
        check("sesion caducada se borra de la base", n == 0, str(n))

        print("\n-- Estaticos --")
        st, hd, body = req("/")
        check("portada sirve HTML", st == 200 and "<html" in body.lower())
        check("favicon accesible", req("/favicon.svg")[0] == 200)
        check("sitemap accesible", req("/sitemap.xml")[0] == 200)

        print("\n-- Sin dependencias externas (el CSP las bloquearia) --")
        for pagina in ("/", "/landing.html", "/admin.html"):
            st, hd, body = req(pagina)
            externos = re.findall(r'src="https?://', body)
            check("%s no carga scripts externos" % pagina, not externos, str(externos[:3]))
        check("tailwind servido localmente", req("/vendor/tailwind.js")[0] == 200)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        if os.path.exists(DB):
            try:
                os.remove(DB)
            except Exception:
                pass

    print("\n================================")
    print("  OK: %d   FALLOS: %d" % (ok, fail))
    print("================================")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
