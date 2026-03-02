"""JSON tool RPC handlers."""

import json

from rpc import RpcServer


def register(server: RpcServer):
    server.add("json_tool.open_file", open_file)
    server.add("json_tool.save_file", save_file)
    server.add("json_tool.format_json", format_json)
    server.add("json_tool.validate_json", validate_json)


def open_file(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    # Validate it's parseable
    json.loads(content)
    return {"content": content, "path": path}


def save_file(path: str, content: str) -> dict:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return {"path": path}


def format_json(content: str, indent: int = 2) -> dict:
    parsed = json.loads(content)
    if indent == 0:
        formatted = json.dumps(parsed, ensure_ascii=False)
    else:
        formatted = json.dumps(parsed, indent=indent, ensure_ascii=False)
    return {"content": formatted}


def validate_json(content: str) -> dict:
    try:
        json.loads(content)
        return {"valid": True}
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "error": str(e),
            "line": e.lineno,
            "column": e.colno,
        }
