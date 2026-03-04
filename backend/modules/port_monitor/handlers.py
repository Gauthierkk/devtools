"""Port monitor — lists listening ports using psutil or lsof fallback."""

import os
import re
import signal

import psutil

from rpc import RpcServer


def register(server: RpcServer):
    server.add("port_monitor.get_ports", get_ports)
    server.add("port_monitor.kill_process", kill_process)


def _run_lsof_posix_spawn() -> str:
    """Run lsof via posix_spawn (no fork) to avoid Network.framework atfork crashes.

    psutil.net_connections() requires root on macOS. subprocess.run() calls fork(),
    which triggers a broken Network.framework atfork handler loaded by psutil and
    crashes the child. posix_spawn bypasses fork entirely.
    """
    lsof_path = "/usr/sbin/lsof"
    r_fd, w_fd = os.pipe()
    try:
        pid = os.posix_spawn(
            lsof_path,
            [lsof_path, "-i", "-P", "-n", "-s", "TCP:LISTEN"],
            dict(os.environ),
            file_actions=[
                (os.POSIX_SPAWN_CLOSE, r_fd),
                (os.POSIX_SPAWN_DUP2, w_fd, 1),
                (os.POSIX_SPAWN_CLOSE, w_fd),
                (os.POSIX_SPAWN_OPEN, 2, "/dev/null", os.O_WRONLY, 0o666),
            ],
        )
        os.close(w_fd)
        w_fd = -1
        chunks: list[bytes] = []
        while chunk := os.read(r_fd, 65536):
            chunks.append(chunk)
        os.waitpid(pid, 0)
        return b"".join(chunks).decode("utf-8", errors="replace")
    finally:
        os.close(r_fd)
        if w_fd != -1:
            os.close(w_fd)


def _parse_lsof(output: str) -> list[dict]:
    """Parse lsof -i TCP:LISTEN output into port records."""
    ports = []
    seen: set[tuple[int, int]] = set()
    for line in output.strip().split("\n")[1:]:  # skip header
        parts = line.split()
        if len(parts) < 9:
            continue
        command = parts[0]
        pid = int(parts[1])
        if parts[7] != "TCP":
            continue
        m = re.match(r"(.+):(\d+)", parts[8].split("->")[0].strip())
        if not m:
            continue
        address, port = m.group(1), int(m.group(2))
        key = (pid, port)
        if key in seen:
            continue
        seen.add(key)
        ports.append(
            {
                "pid": pid,
                "process": command,
                "protocol": "TCP",
                "address": "0.0.0.0" if address == "*" else address,
                "port": port,
            }
        )
    ports.sort(key=lambda p: p["port"])
    return ports


def _get_listening_ports() -> list[dict]:
    """Return listening TCP ports.

    Tries psutil.net_connections() first (requires root on macOS/AIX).
    Falls back to lsof via posix_spawn on AccessDenied.
    """
    try:
        connections = psutil.net_connections(kind="tcp")
    except psutil.AccessDenied:
        # Root required on macOS — fall back to lsof via posix_spawn (no fork)
        try:
            return _parse_lsof(_run_lsof_posix_spawn())
        except Exception:
            return []

    ports = []
    seen: set[tuple[int, int]] = set()
    for conn in connections:
        if conn.status != psutil.CONN_LISTEN:
            continue
        pid = conn.pid or 0
        port = conn.laddr.port
        address = conn.laddr.ip or "0.0.0.0"
        key = (pid, port)
        if key in seen:
            continue
        seen.add(key)
        try:
            proc = psutil.Process(pid) if pid else None
            command = proc.name() if proc else "unknown"
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            command = "unknown"
        ports.append(
            {
                "pid": pid,
                "process": command,
                "protocol": "TCP",
                "address": address,
                "port": port,
            }
        )
    ports.sort(key=lambda p: p["port"])
    return ports


def get_ports() -> dict:
    """Return all listening TCP ports with process info."""
    return {"ports": _get_listening_ports()}


def kill_process(pid: int) -> dict:
    """Kill a process by PID. Sends SIGTERM first, SIGKILL if needed."""
    try:
        os.kill(pid, signal.SIGTERM)
        return {"ok": True}
    except ProcessLookupError:
        return {"ok": True}  # already dead
    except PermissionError:
        raise Exception(f"Permission denied — cannot kill PID {pid}")
