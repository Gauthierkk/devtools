"""Simple JSON-RPC 2.0 server implementation."""

from typing import Any, Callable


class RpcServer:
    def __init__(self):
        self._handlers: dict[str, Callable[..., Any]] = {}

    def add(self, method: str, handler: Callable[..., Any]):
        self._handlers[method] = handler

    def handle(self, request: dict) -> dict:
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params", {})

        if not method:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32600, "message": "Invalid request: missing method"},
                "id": request_id,
            }

        handler = self._handlers.get(method)
        if not handler:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": f"Method not found: {method}"},
                "id": request_id,
            }

        try:
            if isinstance(params, dict):
                result = handler(**params)
            elif isinstance(params, list):
                result = handler(*params)
            else:
                result = handler()

            return {"jsonrpc": "2.0", "result": result, "id": request_id}
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32000, "message": str(e)},
                "id": request_id,
            }
