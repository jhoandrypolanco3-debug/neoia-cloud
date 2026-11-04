# -*- coding: utf-8 -*-
"""Model Router: elige proveedor y parametros segun el tipo de tarea.

Punto unico de entrada para pedir una respuesta de IA:

    from core.router import complete
    texto = complete(messages, task="robotics")

Ventaja: cambiar de proveedor o de modelo no requiere tocar server.py.
"""
from .providers import ProviderError, get_provider

# Perfiles por tipo de tarea. La temperatura baja produce codigo mas estable.
TASKS = {
    "chat": {
        "provider": None,          # None = el configurado en NEOIA_PROVIDER
        "model": None,
        "temperature": 0.5,
        "max_tokens": 1500,
        "timeout": 120,
    },
    "code": {
        "provider": None,
        "model": None,
        "temperature": 0.25,
        "max_tokens": 2200,
        "timeout": 150,
    },
    "robotics": {
        "provider": None,
        "model": None,
        "temperature": 0.35,
        "max_tokens": 2000,
        "timeout": 150,
    },
    "fast": {
        "provider": None,
        "model": None,
        "temperature": 0.2,
        "max_tokens": 400,
        "timeout": 60,
    },
}

DEFAULT_TASK = "chat"


def resolve(task=None, **overrides):
    """Devuelve (proveedor, parametros) para una tarea."""
    key = (task or DEFAULT_TASK).strip().lower()
    cfg = dict(TASKS.get(key, TASKS[DEFAULT_TASK]))
    for k, v in overrides.items():
        if v is not None:
            cfg[k] = v
    provider = get_provider(cfg.pop("provider", None))
    return provider, cfg


def complete(messages, task=None, **overrides):
    """Pide una respuesta y devuelve el texto. Lanza ProviderError si falla."""
    provider, params = resolve(task, **overrides)
    return provider.chat(messages, **params)


def status():
    """Estado del enrutador, para diagnostico y panel."""
    out = []
    for name in sorted(TASKS):
        provider, params = resolve(name)
        out.append({
            "task": name,
            "provider": provider.name,
            "configured": bool(provider.configured),
            "temperature": params.get("temperature"),
            "max_tokens": params.get("max_tokens"),
        })
    return out


__all__ = ["complete", "resolve", "status", "TASKS", "DEFAULT_TASK", "ProviderError"]
