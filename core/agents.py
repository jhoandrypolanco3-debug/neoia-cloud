# -*- coding: utf-8 -*-
"""Registro de agentes.

Un agente es una configuracion con nombre: que tarea usa el router, que
prompt de sistema aplica y si esta habilitado. No ejecuta comandos ni tiene
acceso al sistema: solo decide COMO se le habla al modelo.

Ampliar el catalogo es añadir un register() en server.py.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Agent:
    id: str
    name: str
    description: str
    task: str = "chat"
    system: str = ""
    enabled: bool = True


_REGISTRY = {}


def register(agent, replace=False):
    key = agent.id.strip().lower()
    if key in _REGISTRY and not replace:
        raise ValueError("El agente '%s' ya existe" % key)
    _REGISTRY[key] = Agent(
        id=key,
        name=agent.name,
        description=agent.description,
        task=agent.task,
        system=agent.system,
        enabled=agent.enabled,
    )
    return _REGISTRY[key]


def get(agent_id):
    """Devuelve el agente o None si no existe / esta deshabilitado."""
    return _REGISTRY.get((agent_id or "").strip().lower())


def all_agents():
    return [a for a in _REGISTRY.values() if a.enabled]


def public_list():
    """Version para el frontend: sin el prompt de sistema."""
    return [
        {"id": a.id, "name": a.name, "description": a.description, "task": a.task}
        for a in all_agents()
    ]


def system_for(agent_id, fallback=""):
    """Prompt de sistema del agente pedido, o el fallback."""
    a = get(agent_id)
    if not a:
        return fallback
    return a.system or fallback


def task_for(agent_id, fallback="chat"):
    a = get(agent_id)
    return a.task if a else fallback
