# -*- coding: utf-8 -*-
"""NEOIA CORE — nucleo modular de la plataforma.

Modulos:
    providers  conexion con cada proveedor de IA
    router     eleccion de proveedor y parametros por tarea
    agents     registro de agentes
"""
from . import agents, providers, router

__all__ = ["providers", "router", "agents"]
