"""Networking stats handlers — live system network metrics via psutil."""

import time

import psutil

from rpc import RpcServer


def register(server: RpcServer):
    server.add("networking_stats.get_snapshot", get_snapshot)


def get_snapshot() -> dict:
    """Return a full network snapshot: I/O counters, interfaces, connections."""
    # Total I/O counters
    total = psutil.net_io_counters()
    totals = {
        "bytes_sent": total.bytes_sent,
        "bytes_recv": total.bytes_recv,
        "packets_sent": total.packets_sent,
        "packets_recv": total.packets_recv,
        "errin": total.errin,
        "errout": total.errout,
        "dropin": total.dropin,
        "dropout": total.dropout,
    }

    # Per-interface I/O + metadata
    per_nic = psutil.net_io_counters(pernic=True)
    if_stats = psutil.net_if_stats()
    if_addrs = psutil.net_if_addrs()

    interfaces = {}
    for name, io in per_nic.items():
        stat = if_stats.get(name)
        addrs = if_addrs.get(name, [])
        interfaces[name] = {
            "io": {
                "bytes_sent": io.bytes_sent,
                "bytes_recv": io.bytes_recv,
                "packets_sent": io.packets_sent,
                "packets_recv": io.packets_recv,
                "errin": io.errin,
                "errout": io.errout,
                "dropin": io.dropin,
                "dropout": io.dropout,
            },
            "is_up": stat.isup if stat else False,
            "speed": stat.speed if stat else 0,
            "mtu": stat.mtu if stat else 0,
            "addrs": [
                {"family": _family_name(a.family), "address": a.address}
                for a in addrs
                if a.address
            ],
        }

    # Connection summary by status
    try:
        conns = psutil.net_connections(kind="inet")
        by_status: dict[str, int] = {}
        for c in conns:
            status = c.status if c.status else "NONE"
            by_status[status] = by_status.get(status, 0) + 1
        connections = {"total": len(conns), "by_status": by_status}
    except psutil.AccessDenied:
        connections = {"total": 0, "by_status": {}}

    return {
        "totals": totals,
        "interfaces": interfaces,
        "connections": connections,
        "timestamp": time.time(),
    }


def _family_name(family: int) -> str:
    """Convert socket address family int to human-readable string."""
    import socket

    mapping = {
        socket.AF_INET: "IPv4",
        socket.AF_INET6: "IPv6",
    }
    if hasattr(socket, "AF_LINK"):
        mapping[socket.AF_LINK] = "MAC"
    return mapping.get(family, str(family))
