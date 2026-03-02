"""Port monitor — lists listening ports using lsof (macOS/Linux)."""

import re
import subprocess

from rpc import RpcServer


def register(server: RpcServer):
    server.add("port_monitor.get_ports", get_ports)


def _parse_lsof() -> list[dict]:
    """Parse lsof output to get listening TCP ports."""
    try:
        result = subprocess.run(
            ["lsof", "-i", "-P", "-n", "-s", "TCP:LISTEN"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    ports = []
    seen = set()

    for line in result.stdout.strip().split("\n")[1:]:  # skip header
        parts = line.split()
        if len(parts) < 9:
            continue

        command = parts[0]
        pid = int(parts[1])
        protocol = parts[7]  # TCP or UDP
        if protocol != "TCP":
            continue
        name = parts[8]  # e.g. *:8080 or 127.0.0.1:3000

        # Parse address:port from NAME column
        m = re.match(r"(.+):(\d+)", name.split("->")[0].strip())
        if not m:
            continue

        address = m.group(1)
        port = int(m.group(2))

        key = (pid, port)
        if key in seen:
            continue
        seen.add(key)

        ports.append(
            {
                "pid": pid,
                "process": command,
                "protocol": protocol,
                "address": address if address != "*" else "0.0.0.0",
                "port": port,
            }
        )

    ports.sort(key=lambda p: p["port"])
    return ports


def get_ports() -> dict:
    """Return all listening TCP ports with process info."""
    return {"ports": _parse_lsof()}
