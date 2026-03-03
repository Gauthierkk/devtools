"""Speed test — measures network latency, download speed, and upload speed."""

import concurrent.futures
import os
import socket
import time
import urllib.error
import urllib.request

from rpc import RpcServer

# Well-known hosts for latency measurement (TCP connect to port 80)
_LATENCY_TARGETS = [
    ("1.1.1.1", 80, "Cloudflare"),
    ("8.8.8.8", 80, "Google"),
    ("9.9.9.9", 80, "Quad9"),
]


def register(server: RpcServer) -> None:
    server.add("speed_test.run_ping_batch", run_ping_batch)
    server.add("speed_test.run_download_chunk", run_download_chunk)
    server.add("speed_test.run_upload_chunk", run_upload_chunk)


def run_ping_batch(n_samples: int = 6) -> dict:
    """Ping all targets in parallel using threads. Fast — completes in ~one RTT."""

    def ping_one(host: str, port: int, provider: str) -> dict:
        try:
            t0 = time.perf_counter()
            with socket.create_connection((host, port), timeout=1.0):
                pass
            return {"latency_ms": round((time.perf_counter() - t0) * 1000, 1), "provider": provider, "ok": True}
        except OSError:
            return {"ok": False}

    tasks = [_LATENCY_TARGETS[i % len(_LATENCY_TARGETS)] for i in range(n_samples)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as ex:
        results = list(ex.map(lambda t: ping_one(*t), tasks))

    good = [r for r in results if r["ok"]]
    if not good:
        raise RuntimeError("Could not reach any network host — check internet connection")

    latencies = sorted(r["latency_ms"] for r in good)
    providers = sorted({r["provider"] for r in good})
    median = latencies[len(latencies) // 2]

    return {
        "latency_ms": median,
        "min_ms": latencies[0],
        "max_ms": latencies[-1],
        "providers": providers,
        "samples": len(latencies),
    }


def run_download_chunk(bytes_to_fetch: int = 6_000_000) -> dict:
    """Download `bytes_to_fetch` bytes from Cloudflare and return speed for this chunk."""
    url = f"https://speed.cloudflare.com/__down?bytes={bytes_to_fetch}"
    read_size = 65_536  # 64 KB
    total_bytes = 0

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "devtools-speed-test/1.0"})
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=30) as resp:
            while True:
                chunk = resp.read(read_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
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


def run_upload_chunk(bytes_to_send: int = 6_000_000) -> dict:
    """Upload random data to Cloudflare and return upload speed for this chunk."""
    data = os.urandom(bytes_to_send)
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
