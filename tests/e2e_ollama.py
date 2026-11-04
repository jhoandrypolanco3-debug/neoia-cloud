# -*- coding: utf-8 -*-
"""Prueba end-to-end del CORE usando Ollama local (sin coste).

Verifica que providers -> router -> agents devuelven una respuesta real.
Requiere Ollama corriendo y el modelo descargado.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4488
BASE = "http://127.0.0.1:%d" % PORT
DB = os.path.join(ROOT, ".tmp_e2e.db")


def req(path, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def main():
    if os.path.exists(DB):
        os.remove(DB)
    env = dict(os.environ)
    env.update({"PORT": str(PORT), "DB_PATH": DB,
                "NEOIA_PROVIDER": "ollama"})
    env.pop("OLLAMA_MODEL", None)   # deja que detecte el instalado
    env.pop("DEEPSEEK_API_KEY", None)

    proc = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                req("/api/status"); break
            except Exception:
                time.sleep(0.25)

        st, body = req("/api/status")
        print("status:", st, body)
        print("\nPidiendo una respuesta real al modelo local (puede tardar)...")
        t0 = time.time()
        st, body = req("/api/chat", "POST",
                       {"message": "Responde solo con la palabra: FUNCIONA"})
        dt = time.time() - t0
        print("chat:", st, "| %.1f s" % dt)
        print("respuesta:", body[:400])

        d = json.loads(body)
        ok = st == 200 and isinstance(d.get("reply"), str) and d["reply"].strip()
        print("\nRESULTADO:", "CADENA COMPLETA OK" if ok else "FALLO")
        return 0 if ok else 1
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


if __name__ == "__main__":
    sys.exit(main())
