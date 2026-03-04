# Rust Sidecar Architecture — How DevTools Modules Work

This guide explains how the Tauri Rust shell, the Python backend sidecar, and the React frontend
all fit together — and walks you through adding a new module from scratch.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [The IPC Protocol: JSON-RPC 2.0 over stdin/stdout](#2-the-ipc-protocol-json-rpc-20-over-stdinstdout)
3. [The Rust Shell in Detail](#3-the-rust-shell-in-detail)
   - [State management: `SidecarState`](#31-state-management-sidecarstate)
   - [The `rpc_call` command handler](#32-the-rpc_call-command-handler)
   - [Fast path vs. sidecar path](#33-fast-path-vs-sidecar-path)
   - [Spawning the sidecar](#34-spawning-the-sidecar)
   - [The background reader task](#35-the-background-reader-task)
4. [The Python Sidecar in Detail](#4-the-python-sidecar-in-detail)
   - [Entry point: `main.py`](#41-entry-point-mainpy)
   - [The `RpcServer` class](#42-the-rpcserver-class)
   - [Module registry](#43-module-registry)
5. [The Frontend RPC Client](#5-the-frontend-rpc-client)
6. [Full Data Flow Walkthrough](#6-full-data-flow-walkthrough)
7. [Module Anatomy](#7-module-anatomy)
8. [Tutorial: Adding a New Module](#8-tutorial-adding-a-new-module)
   - [Step 1 — Python backend handler](#step-1--python-backend-handler)
   - [Step 2 — Register the module in Python](#step-2--register-the-module-in-python)
   - [Step 3 — Frontend store](#step-3--frontend-store)
   - [Step 4 — Frontend commands](#step-4--frontend-commands)
   - [Step 5 — Frontend component](#step-5--frontend-component)
   - [Step 6 — Register in the module registry](#step-6--register-in-the-module-registry)
   - [Step 7 — (Optional) Rust fast path](#step-7--optional-rust-fast-path)
9. [Configuration Reference](#9-configuration-reference)
10. [Error Handling Reference](#10-error-handling-reference)
11. [Checklist for a New Module](#11-checklist-for-a-new-module)

---

## 1. High-Level Architecture

DevTools is split into three processes that communicate at runtime:

```
┌──────────────────────────────────────┐
│          React Frontend              │  TypeScript / Tailwind CSS v4
│    (Vite dev server or bundled)      │
└──────────────────┬───────────────────┘
                   │  Tauri IPC (invoke)
                   │
┌──────────────────▼───────────────────┐
│          Tauri Rust Shell            │  src-tauri/src/lib.rs
│   - Hosts the WebView                │
│   - Exposes `rpc_call` command       │
│   - Spawns + manages Python sidecar  │
└──────────────────┬───────────────────┘
                   │  JSON-RPC 2.0 over stdin / stdout
                   │
┌──────────────────▼───────────────────┐
│       Python Backend Sidecar         │  backend/
│   - Reads requests from stdin        │
│   - Dispatches to module handlers    │
│   - Writes responses to stdout       │
└──────────────────────────────────────┘
```

The Rust shell is intentionally thin. Its only jobs are:

- Hosting the WebView that renders the React app.
- Exposing a single `rpc_call` Tauri command to the frontend.
- Spawning the Python sidecar process and brokering messages to/from it.
- Handling a small number of performance-critical operations directly in Rust (the "fast path").

Everything else — real logic, system calls, file I/O beyond what Tauri plugins provide — lives in
the Python sidecar.

---

## 2. The IPC Protocol: JSON-RPC 2.0 over stdin/stdout

All communication between Rust and Python uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
transmitted as newline-delimited JSON over the sidecar process's stdin/stdout pipes.

### Request (Rust → Python stdin)

```json
{
  "jsonrpc": "2.0",
  "method": "port_monitor.get_ports",
  "params": {},
  "id": 7
}
```

| Field | Description |
|---|---|
| `jsonrpc` | Always `"2.0"`. |
| `method` | Dot-namespaced: `<module>.<function>`. |
| `params` | Object of named arguments. Keys become Python keyword args. |
| `id` | Monotonically incrementing integer. Used to match responses to requests. |

### Success Response (Python stdout → Rust)

```json
{
  "jsonrpc": "2.0",
  "result": {
    "ports": [
      { "pid": 1234, "process": "node", "protocol": "TCP", "address": "0.0.0.0", "port": 3000 }
    ]
  },
  "id": 7
}
```

### Error Response (Python stdout → Rust)

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Permission denied — cannot kill PID 1"
  },
  "id": 7
}
```

Rust surfaces the `message` string as a JavaScript `Error`, so the frontend's `try/catch` receives a
readable message.

---

## 3. The Rust Shell in Detail

All Rust application logic lives in `src-tauri/src/lib.rs`. `main.rs` is a two-line entry point
that simply calls `app_lib::run()`.

### 3.1 State management: `SidecarState`

```rust
// src-tauri/src/lib.rs  (lines 10-14)

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    next_id: AtomicU64,
}
```

This struct is registered with Tauri's state system and shared across the application lifetime.

| Field | Type | Purpose |
|---|---|---|
| `child` | `Mutex<Option<CommandChild>>` | The spawned Python process. `Option` because it may not start (e.g. binary not bundled during dev). |
| `pending` | `Mutex<HashMap<u64, oneshot::Sender<…>>>` | Map from request ID → oneshot sender. When a response arrives on stdout, the background reader looks up the ID here and sends the result through the channel. |
| `next_id` | `AtomicU64` | Monotonic counter for generating unique request IDs without locking. |

Both `Mutex` fields are necessary because multiple async tasks (one per in-flight RPC call) may
access state concurrently.

### 3.2 The `rpc_call` command handler

```rust
// src-tauri/src/lib.rs  (lines 16-103)

#[tauri::command]
async fn rpc_call(
    app: tauri::AppHandle,
    method: String,
    params: Value,
) -> Result<Value, String> {
    // ...
}
```

The `#[tauri::command]` macro makes this function callable from the frontend via
`invoke("rpc_call", { method, params })`. Tauri automatically deserializes the JS arguments and
serializes the return value back to JSON.

The function signature returns `Result<Value, String>`. On the JS side, a `Ok(v)` resolves the
promise with `v`, and `Err(msg)` rejects it with `msg` as the error message.

### 3.3 Fast path vs. sidecar path

The handler opens with a `match` on the method name:

```rust
// src-tauri/src/lib.rs  (lines 23-66)

match method.as_str() {
    "json_tool.format_json" => {
        // Extract params
        let content = params
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing content parameter")?;
        let indent = params
            .get("indent")
            .and_then(|v| v.as_u64())
            .unwrap_or(2) as usize;

        // Parse and reformat using serde_json
        let parsed: Value =
            serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {}", e))?;

        let formatted = if indent == 0 {
            serde_json::to_string(&parsed).map_err(|e| e.to_string())?
        } else {
            let buf = Vec::new();
            let indent_bytes = b" ".repeat(indent);
            let formatter = serde_json::ser::PrettyFormatter::with_indent(&indent_bytes);
            let mut ser = serde_json::Serializer::with_formatter(buf, formatter);
            serde::Serialize::serialize(&parsed, &mut ser).map_err(|e| e.to_string())?;
            String::from_utf8(ser.into_inner()).map_err(|e| e.to_string())?
        };

        Ok(serde_json::json!({ "content": formatted }))
    }

    "json_tool.validate_json" => {
        let content = params
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing content parameter")?;

        match serde_json::from_str::<Value>(content) {
            Ok(_) => Ok(serde_json::json!({ "valid": true })),
            Err(e) => Ok(serde_json::json!({
                "valid": false,
                "error": e.to_string(),
                "line": e.line(),
                "column": e.column()
            })),
        }
    }

    // Everything else: forward to Python
    _ => { /* sidecar path — see below */ }
}
```

The fast path handles JSON formatting and validation entirely in Rust because:

1. These operations happen on every keystroke in the editor, so latency matters.
2. `serde_json` provides precise error positions (`line`, `column`) that Python's `json` module
   does not.
3. The user can type JSON without the sidecar running (e.g., during pure frontend development).

**All other methods fall through to the `_` arm and are forwarded to Python.**

### 3.4 Spawning the sidecar

Inside the Tauri `setup` closure, the Python binary is spawned once:

```rust
// src-tauri/src/lib.rs  (lines 126-135)

let shell = app.shell();
match shell.sidecar("devtools-backend") {
    Ok(command) => match command.spawn() {
        Ok((mut rx, child)) => {
            let state = app.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);
            log::info!("Python sidecar started");
            // ... spawn background reader (see §3.5)
        }
        Err(e) => {
            log::warn!("Failed to spawn sidecar: {}. Running without backend.", e);
        }
    },
    Err(e) => {
        log::warn!("Sidecar not found: {}. Running without backend.", e);
    }
}
```

`shell.sidecar("devtools-backend")` looks up the binary by name in the locations declared in
`tauri.conf.json` under `bundle.externalBin`. Both errors are treated as soft failures — the app
starts without a backend and only errors on backend calls.

The `child` handle (a `CommandChild`) is stored in `SidecarState`. Its `write()` method sends bytes
to the process's stdin. The `rx` receiver yields `CommandEvent` values from stdout and stderr.

### 3.5 The background reader task

Immediately after spawning the sidecar, a Tokio async task is launched to read all future stdout
lines:

```rust
// src-tauri/src/lib.rs  (lines 136-185)

let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes);

                // Parse JSON — skip malformed lines
                let response: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Extract the request ID
                let id = match response.get("id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    None => continue,
                };

                // Look up and remove the pending oneshot sender
                let state = app_handle.state::<SidecarState>();
                let tx = state
                    .pending
                    .lock()
                    .ok()
                    .and_then(|mut map| map.remove(&id));

                if let Some(tx) = tx {
                    // Distinguish success vs. error
                    let result = if let Some(err) = response.get("error") {
                        let msg = err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("Unknown sidecar error");
                        Err(msg.to_string())
                    } else {
                        Ok(response.get("result").cloned().unwrap_or(Value::Null))
                    };

                    let _ = tx.send(result);  // receiver may have dropped (timeout, cancel)
                }
            }
            CommandEvent::Stderr(err_bytes) => {
                let msg = String::from_utf8_lossy(&err_bytes);
                log::warn!("Sidecar stderr: {}", msg);
            }
            CommandEvent::Terminated(payload) => {
                log::info!("Sidecar terminated with code: {:?}", payload.code);
                break;
            }
            _ => {}
        }
    }
});
```

This task runs for the entire lifetime of the application. It:

1. Reads each newline-delimited JSON response from stdout.
2. Parses the response and extracts its `id`.
3. Removes the matching `oneshot::Sender` from `pending`.
4. Sends either `Ok(result)` or `Err(message)` through the channel.

Back in `rpc_call`, the sidecar path registers its sender *before* writing to stdin, then awaits
the receiver:

```rust
// src-tauri/src/lib.rs  (lines 69-101)

let state = app.state::<SidecarState>();
let id = state.next_id.fetch_add(1, Ordering::Relaxed);

let request = serde_json::json!({
    "jsonrpc": "2.0",
    "method": method,
    "params": params,
    "id": id,
});

// Register the response channel BEFORE writing (avoid race)
let (tx, rx) = oneshot::channel();
state
    .pending
    .lock()
    .map_err(|e| e.to_string())?
    .insert(id, tx);

// Write request to sidecar stdin
{
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    let child = child_guard
        .as_mut()
        .ok_or("Python sidecar not running")?;
    let msg = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    child
        .write(format!("{}\n", msg).as_bytes())
        .map_err(|e| format!("Failed to write to sidecar: {}", e))?;
}

// Suspend until the background reader sends us our result
rx.await
    .map_err(|_| "Sidecar response channel closed".to_string())?
```

Multiple in-flight calls are fully supported: each gets a unique ID and its own channel pair. The
`AtomicU64` counter ensures unique IDs without a lock.

---

## 4. The Python Sidecar in Detail

### 4.1 Entry point: `main.py`

```python
# backend/main.py

import json
import sys

from rpc import RpcServer
from modules import register_all_modules


def main():
    server = RpcServer()
    register_all_modules(server)       # Wire up all module handlers

    for line in sys.stdin:             # Block on stdin, one line per request
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {
                "jsonrpc": "2.0",
                "error": {"code": -32700, "message": f"Parse error: {e}"},
                "id": None,
            }
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            continue

        response = server.handle(request)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()             # flush after every response — critical


if __name__ == "__main__":
    main()
```

The `sys.stdout.flush()` after every write is **critical**. Without it, Python's buffered I/O
would hold responses in memory and Rust's background reader would stall indefinitely.

The sidecar processes one request at a time in order. Long-running handlers block subsequent
requests. If a module does heavy work, consider running it in a `ThreadPoolExecutor` internally
(as `speed_test` does) and streaming partial results — or split the work into multiple RPC calls
that the frontend sequences.

### 4.2 The `RpcServer` class

```python
# backend/rpc.py

from typing import Any, Callable


class RpcServer:
    def __init__(self):
        self._handlers: dict[str, Callable[..., Any]] = {}

    def add(self, method: str, handler: Callable[..., Any]):
        """Register a handler for a method name."""
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
                result = handler(**params)   # {"key": val} → handler(key=val)
            elif isinstance(params, list):
                result = handler(*params)    # [a, b] → handler(a, b)
            else:
                result = handler()

            return {"jsonrpc": "2.0", "result": result, "id": request_id}
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32000, "message": str(e)},
                "id": request_id,
            }
```

Key design points:

- **Dict params become keyword arguments.** If the request sends `{"pid": 1234}`, the handler
  receives it as `kill_process(pid=1234)`. This means handler signatures serve as the public API
  contract.
- **Any unhandled exception is caught** and returned as a JSON-RPC error with code `-32000`. This
  means you can `raise Exception("helpful message")` anywhere in a handler and the frontend will
  receive a rejected promise with that message.

### 4.3 Module registry

```python
# backend/modules/__init__.py

from rpc import RpcServer
from modules.json_tool import handlers as json_tool
from modules.port_monitor import handlers as port_monitor
from modules.speed_test import handlers as speed_test


def register_all_modules(server: RpcServer):
    json_tool.register(server)
    port_monitor.register(server)
    speed_test.register(server)
```

Each module exposes a `register(server: RpcServer)` function that calls `server.add(method, fn)`
for each of its handlers. Adding a new module is a two-line change here.

---

## 5. The Frontend RPC Client

The entire frontend-to-Rust bridge is a single nine-line file:

```typescript
// src/lib/rpc.ts

import { invoke } from "@tauri-apps/api/core";

export async function rpcCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return invoke<T>("rpc_call", { method, params });
}
```

`invoke("rpc_call", ...)` calls the Tauri command registered in Rust. Tauri handles the
serialization boundary — JS objects become `serde_json::Value` on the Rust side, and the
`Result<Value, String>` return maps to a resolved or rejected JS promise.

The generic parameter `<T>` is a TypeScript type assertion. It does not perform runtime validation.
You are trusting that the Python handler returns the shape you declared.

Usage in a module's `commands.ts`:

```typescript
// src/modules/port-monitor/commands.ts

import { rpcCall } from "../../lib/rpc";
import type { PortEntry } from "./store";

export async function fetchPorts(): Promise<PortEntry[]> {
  const result = await rpcCall<{ ports: PortEntry[] }>("port_monitor.get_ports");
  return result.ports;
}

export async function killProcess(pid: number): Promise<void> {
  await rpcCall<{ ok: boolean }>("port_monitor.kill_process", { pid });
}
```

`rpcCall` objects map directly to the Python handler's keyword arguments. `{ pid }` in TypeScript
becomes `kill_process(pid=...)` in Python.

---

## 6. Full Data Flow Walkthrough

Let's trace a call to `port_monitor.get_ports` from click to render:

```
1. User clicks "Refresh" in PortMonitor.tsx
   │
   ▼
2. commands.ts: fetchPorts()
      const result = await rpcCall<{ ports: PortEntry[] }>("port_monitor.get_ports");
   │
   │  Tauri IPC (invoke)
   ▼
3. lib.rs: rpc_call(app, method="port_monitor.get_ports", params={})
      - method doesn't match any fast-path arm
      - id = next_id.fetch_add(1) → e.g. 7
      - Creates oneshot channel (tx, rx)
      - Inserts tx into pending map under key 7
      - Writes to sidecar stdin:
          {"jsonrpc":"2.0","method":"port_monitor.get_ports","params":{},"id":7}
      - Suspends: rx.await
   │
   │  stdin pipe
   ▼
4. main.py: for line in sys.stdin
      request = json.loads(line)
      response = server.handle(request)
   │
   ▼
5. rpc.py: RpcServer.handle({"method": "port_monitor.get_ports", "params": {}, "id": 7})
      handler = self._handlers["port_monitor.get_ports"]   # → get_ports fn
      result = handler()                                   # params={} → no kwargs
   │
   ▼
6. handlers.py: get_ports() → {"ports": _parse_lsof()}
      _parse_lsof() runs: lsof -i -P -n -s TCP:LISTEN
      Parses output, returns list of dicts
   │
   ▼
7. rpc.py: returns {"jsonrpc":"2.0","result":{"ports":[...]},"id":7}
   │
   ▼
8. main.py: sys.stdout.write(json.dumps(response) + "\n"); sys.stdout.flush()
   │
   │  stdout pipe
   ▼
9. lib.rs background reader task:
      CommandEvent::Stdout(line_bytes) received
      response = serde_json::from_str(&line)   → Value
      id = response["id"].as_u64()             → 7
      tx = pending.remove(7)
      tx.send(Ok(response["result"].clone()))
   │
   ▼
10. lib.rs rpc_call (resumed from rx.await):
       Returns Ok(Value) to Tauri
   │
   │  Tauri IPC return
   ▼
11. commands.ts: rpcCall resolves with { ports: [...] }
       return result.ports
   │
   ▼
12. PortMonitor.tsx:
       store.setPorts(ports)
       Component re-renders with new data
```

---

## 7. Module Anatomy

A complete module consists of parallel pieces in three layers. The port-monitor module is the
cleanest reference implementation:

```
src/modules/port-monitor/         # Frontend
├── PortMonitor.tsx               # Main React component
├── store.ts                      # Zustand state store
├── commands.ts                   # rpcCall wrappers
└── components/
    └── PortTable.tsx             # Sub-component

backend/modules/port_monitor/     # Backend (note: underscore vs hyphen)
├── __init__.py                   # Empty — Python package marker
└── handlers.py                   # RPC handler functions + register()
```

### Frontend: `store.ts`

Defines the module's isolated state using Zustand:

```typescript
// src/modules/port-monitor/store.ts

import { create } from "zustand";

export interface PortEntry {
  pid: number;
  process: string;
  protocol: string;
  address: string;
  port: number;
}

interface PortMonitorState {
  ports: PortEntry[];
  error: string | null;
  setPorts: (ports: PortEntry[]) => void;
  setError: (error: string | null) => void;
}

export const usePortMonitorStore = create<PortMonitorState>()((set) => ({
  ports: [],
  error: null,
  setPorts: (ports) => set({ ports, error: null }),
  setError: (error) => set({ error }),
}));
```

Each module has its own store. There is no global state (except the theme store). This keeps
modules entirely independent.

### Frontend: `commands.ts`

Wraps `rpcCall` with typed, named functions:

```typescript
// src/modules/port-monitor/commands.ts

import { rpcCall } from "../../lib/rpc";
import type { PortEntry } from "./store";

export async function fetchPorts(): Promise<PortEntry[]> {
  try {
    const result = await rpcCall<{ ports: PortEntry[] }>("port_monitor.get_ports");
    return result.ports;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invoke")) {
      throw new Error("Requires Tauri — run with 'npx tauri dev'");
    }
    throw err;
  }
}

export async function killProcess(pid: number): Promise<void> {
  await rpcCall<{ ok: boolean }>("port_monitor.kill_process", { pid });
}
```

### Backend: `handlers.py`

```python
# backend/modules/port_monitor/handlers.py

import os
import re
import signal
import subprocess

from rpc import RpcServer


def register(server: RpcServer):
    server.add("port_monitor.get_ports", get_ports)
    server.add("port_monitor.kill_process", kill_process)


def get_ports() -> dict:
    """Return all listening TCP ports with process info."""
    return {"ports": _parse_lsof()}


def kill_process(pid: int) -> dict:
    """Kill a process by PID. Sends SIGTERM first."""
    try:
        os.kill(pid, signal.SIGTERM)
        return {"ok": True}
    except ProcessLookupError:
        return {"ok": True}   # already gone — treat as success
    except PermissionError:
        raise Exception(f"Permission denied — cannot kill PID {pid}")


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

    for line in result.stdout.strip().split("\n")[1:]:   # skip header row
        parts = line.split()
        if len(parts) < 9:
            continue

        command = parts[0]
        pid = int(parts[1])
        protocol = parts[7]
        if protocol != "TCP":
            continue
        name = parts[8]   # e.g. "*:8080" or "127.0.0.1:3000"

        m = re.match(r"(.+):(\d+)", name.split("->")[0].strip())
        if not m:
            continue

        address = m.group(1)
        port = int(m.group(2))

        key = (pid, port)
        if key in seen:
            continue
        seen.add(key)

        ports.append({
            "pid": pid,
            "process": command,
            "protocol": protocol,
            "address": address if address != "*" else "0.0.0.0",
            "port": port,
        })

    ports.sort(key=lambda p: p["port"])
    return ports
```

### Module registration

```typescript
// src/lib/module-registry.ts  (excerpt)

import { lazy } from "react";
import { registerModule } from "./module-registry";

registerModule({
  id: "port-monitor",
  name: "Ports",
  icon: "network",
  route: "/ports",
  component: lazy(() => import("../modules/port-monitor/PortMonitor")),
});
```

The `ToolModule` interface:

```typescript
export interface ToolModule {
  id: string;       // unique kebab-case identifier
  name: string;     // sidebar display name
  icon: string;     // lucide-react icon name
  route: string;    // React Router path, e.g. "/ports"
  component: LazyExoticComponent<ComponentType>;
}
```

---

## 8. Tutorial: Adding a New Module

We'll add a **Clipboard History** module that records what the user copies and lets them re-paste
items. This is a realistic example because it needs both Python backend logic and a React UI.

> For a purely frontend module (like the LaTeX symbol palette), you only need Steps 3, 5, and 6.

### Step 1 — Python backend handler

Create the handler file:

```
backend/modules/clipboard_history/__init__.py   (empty)
backend/modules/clipboard_history/handlers.py
```

`handlers.py`:

```python
"""Clipboard history — stores and retrieves recent clipboard text."""

from rpc import RpcServer

# In-memory store for this session. Resets when the sidecar restarts.
_history: list[str] = []
_MAX_ENTRIES = 50


def register(server: RpcServer):
    server.add("clipboard_history.add_entry", add_entry)
    server.add("clipboard_history.get_history", get_history)
    server.add("clipboard_history.clear", clear_history)


def add_entry(text: str) -> dict:
    """Add a string to the clipboard history."""
    if not text:
        return {"ok": False, "reason": "empty text"}

    # Deduplicate: move to front if already present
    if text in _history:
        _history.remove(text)
    _history.insert(0, text)

    # Trim to max size
    while len(_history) > _MAX_ENTRIES:
        _history.pop()

    return {"ok": True, "count": len(_history)}


def get_history() -> dict:
    """Return clipboard history, most recent first."""
    return {"entries": list(_history)}


def clear_history() -> dict:
    """Clear all clipboard history."""
    _history.clear()
    return {"ok": True}
```

**Rules for handler functions:**

- Parameters must match what the frontend sends in `params`. Dict keys become keyword args.
- Return a plain `dict` (or a JSON-serializable value). The `RpcServer` wraps it in `"result"`.
- Raise `Exception("message")` to return a JSON-RPC error. The message reaches the frontend as the
  rejection reason.
- No return type annotation is strictly required, but it helps readers understand the contract.

### Step 2 — Register the module in Python

Edit `backend/modules/__init__.py`:

```python
# backend/modules/__init__.py

from rpc import RpcServer
from modules.json_tool import handlers as json_tool
from modules.port_monitor import handlers as port_monitor
from modules.speed_test import handlers as speed_test
from modules.clipboard_history import handlers as clipboard_history   # ← add this


def register_all_modules(server: RpcServer):
    json_tool.register(server)
    port_monitor.register(server)
    speed_test.register(server)
    clipboard_history.register(server)   # ← add this
```

That's the entire backend wiring. The sidecar now handles three new method names:
`clipboard_history.add_entry`, `clipboard_history.get_history`, `clipboard_history.clear`.

### Step 3 — Frontend store

```
src/modules/clipboard-history/store.ts
```

```typescript
// src/modules/clipboard-history/store.ts

import { create } from "zustand";

interface ClipboardHistoryState {
  entries: string[];
  setEntries: (entries: string[]) => void;
}

export const useClipboardHistoryStore = create<ClipboardHistoryState>()((set) => ({
  entries: [],
  setEntries: (entries) => set({ entries }),
}));
```

Keep the store simple: it holds data and setters. Logic belongs in `commands.ts` or the component.

### Step 4 — Frontend commands

```
src/modules/clipboard-history/commands.ts
```

```typescript
// src/modules/clipboard-history/commands.ts

import { rpcCall } from "../../lib/rpc";

export async function addEntry(text: string): Promise<void> {
  await rpcCall<{ ok: boolean; count: number }>(
    "clipboard_history.add_entry",
    { text },
  );
}

export async function getHistory(): Promise<string[]> {
  const result = await rpcCall<{ entries: string[] }>("clipboard_history.get_history");
  return result.entries;
}

export async function clearHistory(): Promise<void> {
  await rpcCall<{ ok: boolean }>("clipboard_history.clear");
}
```

**Naming rule:** the object key in `params` must match the Python function's parameter name exactly.
`{ text }` here maps to `add_entry(text: str)` in Python.

### Step 5 — Frontend component

```
src/modules/clipboard-history/ClipboardHistory.tsx
```

```typescript
// src/modules/clipboard-history/ClipboardHistory.tsx

import { useEffect } from "react";
import { useClipboardHistoryStore } from "./store";
import { getHistory, clearHistory } from "./commands";

export default function ClipboardHistory() {
  const { entries, setEntries } = useClipboardHistoryStore();

  useEffect(() => {
    getHistory().then(setEntries).catch(console.error);
  }, []);

  async function handleClear() {
    await clearHistory();
    setEntries([]);
  }

  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h1 className="text-text-primary text-lg font-semibold">Clipboard History</h1>
        <button
          onClick={handleClear}
          className="text-sm text-text-muted hover:text-text-primary"
        >
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-text-muted text-sm">No history yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry, i) => (
            <li
              key={i}
              className="bg-bg-secondary rounded px-3 py-2 text-sm text-text-primary font-mono truncate"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

The default export is what `lazy()` will load. There is no required interface — Tauri's lazy
loading just needs a default export component.

### Step 6 — Register in the module registry

Edit `src/lib/module-registry.ts` and add two lines:

```typescript
// src/lib/module-registry.ts  (add at the bottom)

registerModule({
  id: "clipboard-history",
  name: "Clipboard",
  icon: "clipboard-list",        // any lucide-react icon name
  route: "/clipboard",
  component: lazy(() => import("../modules/clipboard-history/ClipboardHistory")),
});
```

That's it. The Shell renders all registered routes automatically, and the Sidebar lists all
registered modules.

### Step 7 — (Optional) Rust fast path

If your module has a method that is called very frequently (e.g. on every keystroke) and the work
can be done in Rust, you can short-circuit the Python sidecar by adding an arm to the `match` in
`src-tauri/src/lib.rs`:

```rust
// src-tauri/src/lib.rs — inside rpc_call(), before the `_ =>` arm

"clipboard_history.sanitize" => {
    // Hypothetical: strip non-printable characters entirely in Rust
    let text = params
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or("Missing text parameter")?;
    let sanitized: String = text.chars().filter(|c| !c.is_control()).collect();
    Ok(serde_json::json!({ "text": sanitized }))
}
```

This is only worthwhile when:
- The method is on a hot path (called many times per second), **and**
- The Rust implementation is meaningfully faster or simpler than Python, **and**
- You don't need the Python ecosystem (no subprocess, no third-party libraries).

For most modules, skipping the fast path and going straight to Python is correct.

---

## 9. Configuration Reference

### `src-tauri/tauri.conf.json` — Sidecar binary declaration

```json
{
  "bundle": {
    "externalBin": [
      "binaries/devtools-backend"
    ]
  }
}
```

`externalBin` tells Tauri to bundle the binary at `binaries/devtools-backend-<target-triple>` into
the app. During development (`npx tauri dev`), Tauri looks for the binary on `PATH` or in the
`binaries/` directory. The binary is produced by PyInstaller (or a similar packager) from the
Python source.

### `src-tauri/Cargo.toml` — Rust dependencies

```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2.10.0", features = [] }
tauri-plugin-shell = "2"      # sidecar spawning
tauri-plugin-dialog = "2"     # open/save dialogs
tauri-plugin-fs = "2"         # file read/write
tokio = { version = "1", features = ["sync"] }   # oneshot channels
log = "0.4"
tauri-plugin-log = "2"
```

`tokio` is needed for `oneshot::channel`. Only the `sync` feature is required.

### `backend/pyproject.toml` — Python project

```toml
[project]
name = "devtools-backend"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = ["psutil>=6.0"]

[tool.ruff]
line-length = 100
target-version = "py313"
```

Add new Python dependencies here, then run `uv sync` to install them. Use `uv add <package>` to
add and sync in one step.

---

## 10. Error Handling Reference

### Python → Rust → Frontend error propagation

```
Python handler raises Exception("something went wrong")
  │
  ▼
rpc.py: catches exception, returns {"error": {"code": -32000, "message": "something went wrong"}}
  │
  ▼
main.py: writes response JSON to stdout
  │
  ▼
lib.rs background reader: sees "error" key, tx.send(Err("something went wrong"))
  │
  ▼
lib.rs rpc_call: rx.await returns Err("something went wrong")
  │
  ▼
Tauri: returns Err string to frontend as rejected invoke()
  │
  ▼
rpcCall<T>: Promise rejects with Error("something went wrong")
  │
  ▼
commands.ts catch block (or unhandled rejection)
```

### JSON-RPC error codes

| Code | Meaning | When |
|---|---|---|
| `-32700` | Parse error | Rust sent malformed JSON to stdin |
| `-32600` | Invalid request | Request has no `method` field |
| `-32601` | Method not found | No handler registered for this method name |
| `-32000` | Server error | Handler raised an unhandled Python exception |

### Common mistakes

**Method name typo:**
```
Error: Method not found: clipboard_hitory.add_entry
```
Check spelling in `server.add(...)` in `handlers.py`, `commands.ts`, and `__init__.py`.

**Missing `sys.stdout.flush()`:**
Rust's background reader stalls forever. The call awaits but never resolves.

**Params key mismatch:**
```python
def add_entry(content: str) -> dict:   # Python expects "content"
```
```typescript
rpcCall("clipboard_history.add_entry", { text: "hello" })  // sends "text"
```
Python receives `add_entry(text="hello")` and raises `TypeError: unexpected keyword argument`.
The error propagates as a `-32000` with message `"unexpected keyword argument 'text'"`.

**Forgetting `register()` in `__init__.py`:**
The method is implemented but never registered. Rust forwards the call to Python, Python's
`RpcServer` finds no handler, returns `-32601 Method not found`.

**Returning a non-serializable value from Python:**
```python
import datetime
def get_now() -> dict:
    return {"time": datetime.datetime.now()}  # datetime is not JSON-serializable
```
`json.dumps` in `main.py` raises `TypeError`. This crashes the sidecar process entirely —
subsequent calls will fail with "Sidecar response channel closed". Always return plain dicts with
JSON-compatible values (str, int, float, bool, list, dict, None).

---

## 11. Checklist for a New Module

Use this checklist when adding a module. Each box maps to a concrete file edit.

**Backend (Python)**

- [ ] Create `backend/modules/<module_name>/` directory
- [ ] Create `backend/modules/<module_name>/__init__.py` (empty file)
- [ ] Create `backend/modules/<module_name>/handlers.py` with:
  - [ ] `register(server: RpcServer)` function calling `server.add()` for each handler
  - [ ] Handler functions with keyword-argument signatures matching frontend `params`
  - [ ] Plain-dict return values
  - [ ] `raise Exception("...")` for error cases
- [ ] Edit `backend/modules/__init__.py`:
  - [ ] Import `handlers as <module_name>`
  - [ ] Call `<module_name>.register(server)` in `register_all_modules`

**Frontend**

- [ ] Create `src/modules/<module-name>/` directory
- [ ] Create `src/modules/<module-name>/store.ts` with a Zustand store
- [ ] Create `src/modules/<module-name>/commands.ts` with typed `rpcCall` wrappers
- [ ] Create `src/modules/<module-name>/<ModuleName>.tsx` with default-exported component
- [ ] Edit `src/lib/module-registry.ts`:
  - [ ] Call `registerModule({ id, name, icon, route, component: lazy(...) })`

**Rust (only if adding a fast path)**

- [ ] Edit `src-tauri/src/lib.rs`:
  - [ ] Add a new `match` arm for the method name before the `_ =>` fallthrough
  - [ ] Extract params using `.get("key").and_then(|v| v.as_str())`
  - [ ] Return `Ok(serde_json::json!({ ... }))` or `Err("message".to_string())`

**Verify**

- [ ] Run `cd backend && uv run ruff check .` — no linting errors
- [ ] Run `cd backend && uv run ruff format .` — code is formatted
- [ ] Run `npx tsc --noEmit` — no TypeScript errors
- [ ] Run `npx tauri dev` and navigate to the new module route
- [ ] Confirm the module appears in the sidebar and the first RPC call succeeds
