"""Speed test — measures network latency, download speed, and upload speed."""

import concurrent.futures
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request

import urllib3

from rpc import RpcServer

# Well-known hosts for latency measurement (TCP connect to port 80)
_LATENCY_TARGETS = [
    ("1.1.1.1", 80, "Cloudflare"),
    ("8.8.8.8", 80, "Google"),
    ("9.9.9.9", 80, "Quad9"),
]

_SERVERS_FILE = os.path.join(os.path.dirname(__file__), "servers.json")

# Progress tracking for live polling
_progress_lock = threading.Lock()
_current_progress: dict[str, dict] = {}


def _update_progress(phase: str, total_bytes: int, elapsed_s: float) -> None:
    speed_mbps = (total_bytes * 8) / (elapsed_s * 1_000_000) if elapsed_s > 0 else 0
    with _progress_lock:
        _current_progress[phase] = {
            "total_bytes": total_bytes,
            "elapsed_s": round(elapsed_s, 2),
            "speed_mbps": round(speed_mbps, 1),
        }


def _clear_progress(phase: str) -> None:
    with _progress_lock:
        _current_progress.pop(phase, None)


def _load_servers() -> list[dict]:
    """Load server definitions from servers.json."""
    with open(_SERVERS_FILE, "r") as f:
        data = json.load(f)
    return data["servers"]


def _get_server(server_id: str | None) -> dict | None:
    """Look up a server by ID. Returns None for default (Cloudflare inline)."""
    if not server_id or server_id == "cloudflare":
        return None
    for s in _load_servers():
        if s["id"] == server_id:
            return s
    return None


def register(server: RpcServer) -> None:
    server.add("speed_test.run_ping_batch", run_ping_batch)
    server.add("speed_test.run_download_chunk", run_download_chunk)
    server.add("speed_test.run_upload_chunk", run_upload_chunk)
    server.add("speed_test.run_download_test", run_download_test)
    server.add("speed_test.run_upload_test", run_upload_test)
    server.add("speed_test.get_speed_progress", get_speed_progress)
    server.add("speed_test.list_servers", list_servers)


def list_servers() -> dict:
    """Return available speed test servers."""
    return {"servers": _load_servers()}


def _extract_host(url: str) -> str:
    """Extract hostname from a URL."""
    from urllib.parse import urlparse

    return urlparse(url).hostname or ""


def run_ping_batch(n_samples: int = 6, server_id: str | None = None) -> dict:
    """Ping targets in parallel using threads. Fast — completes in ~one RTT."""

    def ping_one(host: str, port: int, provider: str) -> dict:
        try:
            t0 = time.perf_counter()
            with socket.create_connection((host, port), timeout=2.0):
                pass
            return {
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "provider": provider,
                "ok": True,
            }
        except OSError:
            return {"ok": False}

    srv = _get_server(server_id)
    if srv is not None:
        host = _extract_host(srv["download_url"])
        targets = [(host, 443, srv["name"])] * n_samples
    else:
        targets = [_LATENCY_TARGETS[i % len(_LATENCY_TARGETS)] for i in range(n_samples)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(targets)) as ex:
        results = list(ex.map(lambda t: ping_one(*t), targets))

    good = [r for r in results if r["ok"]]
    if not good:
        raise RuntimeError("Could not reach any network host — check internet connection")

    latencies = sorted(r["latency_ms"] for r in good)
    providers = sorted({r["provider"] for r in good})
    median = latencies[len(latencies) // 2]
    jitter = round(latencies[-1] - latencies[0], 1) if len(latencies) > 1 else 0.0

    return {
        "latency_ms": median,
        "min_ms": latencies[0],
        "max_ms": latencies[-1],
        "jitter_ms": jitter,
        "providers": providers,
        "samples": len(latencies),
        "all_ms": latencies,
    }


# ─── Legacy single-chunk handlers (kept for compatibility) ────────────────────


def run_download_chunk(bytes_to_fetch: int = 6_000_000, server_id: str | None = None) -> dict:
    """Download `bytes_to_fetch` bytes and return speed for this chunk."""
    srv = _get_server(server_id)
    read_size = 65_536  # 64 KB
    total_bytes = 0

    if srv is None:
        url = f"https://speed.cloudflare.com/__down?bytes={bytes_to_fetch}"
        headers = {"User-Agent": "devtools-speed-test/1.0"}
    else:
        url = srv["download_url"]
        if "{size}" in url:
            url = url.replace("{size}", str(bytes_to_fetch))
            headers = {"User-Agent": "devtools-speed-test/1.0"}
        else:
            headers = {
                "User-Agent": "devtools-speed-test/1.0",
                "Range": f"bytes=0-{bytes_to_fetch - 1}",
            }

    try:
        req = urllib.request.Request(url, headers=headers)
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=30) as resp:
            while True:
                chunk = resp.read(read_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes >= bytes_to_fetch:
                    break
        elapsed = time.perf_counter() - t0
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Download failed: {exc.reason}") from exc
    except OSError as exc:
        raise RuntimeError(f"Download failed: {exc}") from exc

    if elapsed < 0.01:
        raise RuntimeError("Download completed too quickly to be reliable")

    speed_mbps = (total_bytes * 8) / (elapsed * 1_000_000)
    return {
        "speed_mbps": round(speed_mbps, 1),
        "bytes_received": total_bytes,
        "duration_s": round(elapsed, 2),
    }


def run_upload_chunk(bytes_to_send: int = 6_000_000, server_id: str | None = None) -> dict:
    """Upload random data and return upload speed for this chunk."""
    data = os.urandom(bytes_to_send)

    srv = _get_server(server_id)
    if srv is not None and srv.get("upload_url"):
        url = srv["upload_url"]
    else:
        url = "https://speed.cloudflare.com/__up"

    try:
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "User-Agent": "devtools-speed-test/1.0",
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(data)),
            },
        )
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        elapsed = time.perf_counter() - t0
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Upload failed: {exc.reason}") from exc
    except OSError as exc:
        raise RuntimeError(f"Upload failed: {exc}") from exc

    if elapsed < 0.01:
        raise RuntimeError("Upload completed too quickly to be reliable")

    speed_mbps = (bytes_to_send * 8) / (elapsed * 1_000_000)
    return {
        "speed_mbps": round(speed_mbps, 1),
        "bytes_sent": bytes_to_send,
        "duration_s": round(elapsed, 2),
    }


# ─── Parallel multi-stream handlers ──────────────────────────────────────────


def _build_download_url(srv: dict | None, chunk_bytes: int) -> tuple[str, dict]:
    """Build download URL and headers for a server."""
    if srv is None:
        return (
            f"https://speed.cloudflare.com/__down?bytes={chunk_bytes}",
            {"User-Agent": "devtools-speed-test/1.0"},
        )
    url = srv["download_url"]
    if "{size}" in url:
        return (
            url.replace("{size}", str(chunk_bytes)),
            {"User-Agent": "devtools-speed-test/1.0"},
        )
    return (
        url,
        {
            "User-Agent": "devtools-speed-test/1.0",
            "Range": f"bytes=0-{chunk_bytes - 1}",
        },
    )


def run_download_test(
    server_id: str | None = None,
    num_streams: int = 6,
    chunk_bytes: int = 5_000_000,
    duration_target_s: float = 10.0,
) -> dict:
    """Run a parallel multi-stream download test for accurate throughput measurement."""
    srv = _get_server(server_id)
    url, headers = _build_download_url(srv, chunk_bytes)

    timeout = urllib3.Timeout(connect=5, read=30)
    pool = urllib3.PoolManager(num_pools=1, maxsize=num_streams, headers=headers, timeout=timeout)
    shared_bytes = [0]  # mutable container for thread-safe accumulation
    lock = threading.Lock()
    start_time = time.perf_counter()

    def worker(_worker_id: int) -> int:
        worker_bytes = 0
        while time.perf_counter() - start_time < duration_target_s:
            try:
                resp = pool.request("GET", url, preload_content=False)
                for data in resp.stream(65_536):
                    worker_bytes += len(data)
                resp.release_conn()
            except Exception:
                break
            with lock:
                shared_bytes[0] += worker_bytes
                _update_progress("download", shared_bytes[0], time.perf_counter() - start_time)
                worker_bytes = 0
        # Flush remaining bytes
        if worker_bytes > 0:
            with lock:
                shared_bytes[0] += worker_bytes
                _update_progress("download", shared_bytes[0], time.perf_counter() - start_time)
        return 0

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_streams) as ex:
            futures = [ex.submit(worker, i) for i in range(num_streams)]
            concurrent.futures.wait(futures)

        elapsed = time.perf_counter() - start_time
        total = shared_bytes[0]

        if elapsed < 0.1 or total == 0:
            raise RuntimeError("Download test failed — no data received")

        speed_mbps = (total * 8) / (elapsed * 1_000_000)
        return {
            "speed_mbps": round(speed_mbps, 1),
            "total_bytes": total,
            "duration_s": round(elapsed, 2),
            "streams": num_streams,
        }
    finally:
        _clear_progress("download")
        pool.clear()


def run_upload_test(
    server_id: str | None = None,
    num_streams: int = 6,
    chunk_bytes: int = 2_000_000,
    duration_target_s: float = 10.0,
) -> dict:
    """Run a parallel multi-stream upload test for accurate throughput measurement."""
    srv = _get_server(server_id)
    if srv is not None and srv.get("upload_url"):
        url = srv["upload_url"]
    else:
        url = "https://speed.cloudflare.com/__up"

    upload_headers = {
        "User-Agent": "devtools-speed-test/1.0",
        "Content-Type": "application/octet-stream",
    }
    timeout = urllib3.Timeout(connect=5, read=30)
    pool = urllib3.PoolManager(num_pools=1, maxsize=num_streams, timeout=timeout)
    shared_bytes = [0]
    lock = threading.Lock()
    start_time = time.perf_counter()

    def worker(_worker_id: int) -> int:
        # Pre-generate a reusable random buffer per worker
        payload = os.urandom(chunk_bytes)
        worker_bytes = 0
        while time.perf_counter() - start_time < duration_target_s:
            try:
                pool.request("POST", url, body=payload, headers=upload_headers)
                worker_bytes += chunk_bytes
            except Exception:
                break
            with lock:
                shared_bytes[0] += worker_bytes
                _update_progress("upload", shared_bytes[0], time.perf_counter() - start_time)
                worker_bytes = 0
        if worker_bytes > 0:
            with lock:
                shared_bytes[0] += worker_bytes
                _update_progress("upload", shared_bytes[0], time.perf_counter() - start_time)
        return 0

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_streams) as ex:
            futures = [ex.submit(worker, i) for i in range(num_streams)]
            concurrent.futures.wait(futures)

        elapsed = time.perf_counter() - start_time
        total = shared_bytes[0]

        if elapsed < 0.1 or total == 0:
            raise RuntimeError("Upload test failed — no data sent")

        speed_mbps = (total * 8) / (elapsed * 1_000_000)
        return {
            "speed_mbps": round(speed_mbps, 1),
            "total_bytes": total,
            "duration_s": round(elapsed, 2),
            "streams": num_streams,
        }
    finally:
        _clear_progress("upload")
        pool.clear()


def get_speed_progress(phase: str = "download") -> dict:
    """Return current progress of a running speed test phase (for polling)."""
    with _progress_lock:
        return _current_progress.get(phase, {"total_bytes": 0, "elapsed_s": 0, "speed_mbps": 0})
