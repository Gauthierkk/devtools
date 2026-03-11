"""DevTools backend sidecar — JSON-RPC over stdin/stdout."""

import concurrent.futures
import json
import sys
import threading

from rpc import RpcServer
from modules import register_all_modules

# Methods that block for 10+ seconds — dispatch to background thread
_LONG_RUNNING = {"speed_test.run_download_test", "speed_test.run_upload_test"}

_stdout_lock = threading.Lock()


def _safe_write(response: dict) -> None:
    """Thread-safe write of a JSON-RPC response to stdout."""
    line = json.dumps(response) + "\n"
    with _stdout_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def main():
    server = RpcServer()
    register_all_modules(server)
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

    def handle_and_respond(request: dict) -> None:
        response = server.handle(request)
        _safe_write(response)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _safe_write(
                {
                    "jsonrpc": "2.0",
                    "error": {"code": -32700, "message": f"Parse error: {e}"},
                    "id": None,
                }
            )
            continue

        method = request.get("method", "")
        if method in _LONG_RUNNING:
            executor.submit(handle_and_respond, request)
        else:
            handle_and_respond(request)


if __name__ == "__main__":
    main()
