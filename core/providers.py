# -*- coding: utf-8 -*-
"""Proveedores de modelos de lenguaje.

Solo biblioteca estandar: urllib, json, os.
Cada proveedor expone .chat(messages, ...) -> str.

Regla de seguridad: los errores de un proveedor NUNCA se propagan con su
mensaje original al cliente. Se envuelven en ProviderError, que lleva un
texto apto para el usuario.
"""
import json
import os
import urllib.error
import urllib.request


class ProviderError(Exception):
    """Error controlado y seguro para mostrar al usuario."""


class BaseProvider:
    name = "base"

    @property
    def configured(self):
        return True

    def chat(self, messages, model=None, temperature=0.5, max_tokens=1500, timeout=120):
        raise NotImplementedError


def _post_json(url, payload, headers, timeout):
    """POST JSON con urllib y traduccion de errores a ProviderError."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        raw = urllib.request.urlopen(req, timeout=timeout).read()
    except urllib.error.HTTPError as e:
        raise ProviderError("El proveedor rechazo la solicitud.") from e
    except Exception as e:
        raise ProviderError("No se pudo contactar al proveedor de IA.") from e
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as e:
        raise ProviderError("El proveedor devolvio una respuesta invalida.") from e


class DeepSeekProvider(BaseProvider):
    name = "deepseek"

    def __init__(self):
        self.api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        self.url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
        self.default_model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

    @property
    def configured(self):
        return bool(self.api_key)

    def chat(self, messages, model=None, temperature=0.5, max_tokens=1500, timeout=120):
        if not self.configured:
            raise ProviderError("La IA no esta configurada en este servidor.")
        body = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        data = _post_json(self.url, body, {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + self.api_key,
        }, timeout)
        try:
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            raise ProviderError("El proveedor no devolvio contenido.") from e


class OllamaProvider(BaseProvider):
    """Modelo local. Util para desarrollo sin coste por consulta."""

    name = "ollama"

    def __init__(self):
        self.base = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        self.default_model = os.environ.get("OLLAMA_MODEL", "").strip()
        self._resolved = None

    def _pick_model(self):
        """Si el modelo pedido no existe, usa el primero instalado."""
        if self._resolved:
            return self._resolved
        try:
            raw = urllib.request.urlopen(self.base + "/api/tags", timeout=5).read()
            names = [m.get("name") for m in json.loads(raw.decode("utf-8")).get("models", [])]
            names = [n for n in names if n]
            if self.default_model in names:
                self._resolved = self.default_model
            elif names:
                self._resolved = names[0]
        except Exception:
            pass
        return self._resolved or self.default_model

    def chat(self, messages, model=None, temperature=0.5, max_tokens=1500, timeout=180):
        chosen = model or self._pick_model()
        if not chosen:
            raise ProviderError("No hay ningun modelo local instalado en Ollama.")
        body = {
            "model": chosen,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        data = _post_json(self.base + "/api/chat", body, {"Content-Type": "application/json"}, timeout)
        try:
            return data["message"]["content"]
        except Exception as e:
            raise ProviderError("El modelo local no devolvio contenido.") from e


class OpenAICompatProvider(BaseProvider):
    """Cualquier endpoint compatible con /chat/completions."""

    name = "openai-compatible"

    def __init__(self):
        self.api_key = os.environ.get("NEOIA_COMPAT_KEY", "").strip()
        self.url = os.environ.get("NEOIA_COMPAT_URL", "").strip()
        self.default_model = os.environ.get("NEOIA_COMPAT_MODEL", "")

    @property
    def configured(self):
        return bool(self.url)

    def chat(self, messages, model=None, temperature=0.5, max_tokens=1500, timeout=120):
        if not self.configured:
            raise ProviderError("El proveedor alternativo no esta configurado.")
        body = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = "Bearer " + self.api_key
        data = _post_json(self.url, body, headers, timeout)
        try:
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            raise ProviderError("El proveedor alternativo no devolvio contenido.") from e


_FACTORY = {
    "deepseek": DeepSeekProvider,
    "ollama": OllamaProvider,
    "openai-compatible": OpenAICompatProvider,
}
_CACHE = {}


def available():
    """Nombres de proveedor soportados."""
    return sorted(_FACTORY)


def get_provider(name=None):
    """Devuelve una instancia (cacheada) del proveedor pedido."""
    key = (name or os.environ.get("NEOIA_PROVIDER") or "deepseek").strip().lower()
    if key not in _FACTORY:
        key = "deepseek"
    if key not in _CACHE:
        _CACHE[key] = _FACTORY[key]()
    return _CACHE[key]


def reset_cache():
    _CACHE.clear()
