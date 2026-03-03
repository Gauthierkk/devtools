"""Speed test — measures network latency, download speed, and disk I/O throughput."""

import os
import socket
import statistics
import tempfile
import time
import urllib.error
import urllib.request

from rpc import RpcServer

# Cloudflare's public speed test endpoint (designed for this use)
_DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=25000000"

# Well-known hosts for latency measurement (TCP connect to port 80)
_LATENCY_TARGETS = [
    ("1.1.1.1", 80),   # Cloudflare DNS
    ("8.8.8.8", 80),   # Google DNS
    ("9.9.9.9", 80),   # Quad9 DNS
]

_DISK_TEST_SIZE_MB = 100


def register(server: RpcServer) -> None:
    server.add("speed_test.run_ping", run_ping)
    server.add("speed_test.run_download", run_download)
    server.add("speed_test.run_disk_write", run_disk_write)
    server.add("speed_test.run_disk_read", run_disk_read)


def run_ping() -> dict:
    """Measure network round-trip latency via TCP connect to DNS resolvers."""
    samples: list[float] = []

    for host, port in _LATENCY_TARGETS:
        for _ in range(3):
            try:
                t0 = time.perf_counter()
                with socket.create_connection((host, port), timeout=3):
                    pass
                samples.append((time.perf_counter() - t0) * 1000)
            except OSError:
                pass

    if not samples:
        raise RuntimeError(
            "Could not reach any network host — check internet connection"
        )

    return {
        "latency_ms": round(statistics.median(samples), 1),
        "min_ms": round(min(samples), 1),
        "max_ms": round(max(samples), 1),
        "samples": len(samples),
    }


def run_download() -> dict:
    """Measure download throughput by fetching from Cloudflare's speed-test CDN."""
    chunk_size = 65_536  # 64 KB
    total_bytes = 0

    try:
        req = urllib.request.Request(
            _DOWNLOAD_URL,
            headers={"User-Agent": "devtools-speed-test/1.0"},
        )
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=30) as resp:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
        elapsed = time.perf_counter() - t0
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Download test failed: {exc.reason}") from exc
    except OSError as exc:
        raise RuntimeError(f"Download test failed: {exc}") from exc

    if elapsed < 0.01:
        raise RuntimeError("Download completed too quickly to produce a reliable result")

    speed_mbps = (total_bytes * 8) / (elapsed * 1_000_000)
    return {
        "speed_mbps": round(speed_mbps, 1),
        "bytes_received": total_bytes,
        "duration_s": round(elapsed, 2),
    }


def run_disk_write(size_mb: int = _DISK_TEST_SIZE_MB) -> dict:
    """Write a temporary file to measure sequential disk write throughput."""
    size_bytes = size_mb * 1024 * 1024
    block = os.urandom(1024 * 1024)  # 1 MB random block to avoid compression tricks

    fd, temp_path = tempfile.mkstemp(suffix=".speedtest")
    try:
        os.close(fd)
        t0 = time.perf_counter()
        with open(temp_path, "wb") as f:
            bytes_written = 0
            while bytes_written < size_bytes:
                f.write(block)
                bytes_written += len(block)
            f.flush()
            os.fsync(f.fileno())
        elapsed = time.perf_counter() - t0
    except OSError as exc:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise RuntimeError(f"Disk write test failed: {exc}") from exc

    speed_mbs = (size_bytes / (1024 * 1024)) / elapsed
    return {
        "speed_mbs": round(speed_mbs, 1),
        "temp_path": temp_path,
        "size_mb": size_mb,
        "duration_s": round(elapsed, 2),
    }


def run_disk_read(temp_path: str) -> dict:
    """Read the temp file written by run_disk_write and report read throughput."""
    chunk_size = 1024 * 1024  # 1 MB chunks
    total_bytes = 0

    try:
        t0 = time.perf_counter()
        with open(temp_path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
        elapsed = time.perf_counter() - t0
    except OSError as exc:
        raise RuntimeError(f"Disk read test failed: {exc}") from exc
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    if elapsed < 0.001:
        elapsed = 0.001  # guard against division by zero on ultra-fast NVMe

    speed_mbs = (total_bytes / (1024 * 1024)) / elapsed
    return {
        "speed_mbs": round(speed_mbs, 1),
        "size_mb": round(total_bytes / (1024 * 1024), 1),
        "duration_s": round(elapsed, 2),
    }
