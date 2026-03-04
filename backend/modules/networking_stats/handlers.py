"""Networking stats handlers"""

import psutil

from rpc import RpcServer


def register(server: RpcServer):
    server.add("networking_stats.get_network_in", get_network_in)
