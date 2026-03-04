# Rust Sidecar Architecture

This guide explains how the Tauri Rust shell, Python backend sidecar, and React frontend fit
together, and what you need to touch to add a new module.

---

## Architecture

DevTools runs as three communicating processes:

```
┌──────────────────────────────────────┐
│          React Frontend              │  TypeScript / Tailwind CSS v4
└──────────────────┬───────────────────┘
                   │  Tauri IPC  (invoke)
┌──────────────────▼───────────────────┐
│          Tauri Rust Shell            │  src-tauri/src/lib.rs
│   Hosts WebView · exposes rpc_call   │
│   Spawns + brokers Python sidecar    │
└──────────────────┬───────────────────┘
                   │  JSON-RPC 2.0 · stdin / stdout
┌──────────────────▼───────────────────┐
│       Python Backend Sidecar         │  backend/
│   Reads stdin · dispatches handlers  │
│   Writes results to stdout           │
└──────────────────────────────────────┘
```

The Rust shell is intentionally thin — one command (`rpc_call`), one spawned process, one
background reader. All real logic lives in Python.

---

## The IPC Protocol

All Rust↔Python communication is newline-delimited JSON-RPC 2.0 over stdin/stdout.

**Request** (Rust writes to Python stdin):
```json
{ "jsonrpc": "2.0", "method": "port_monitor.get_ports", "params": {}, "id": 7 }
```

**Success response** (Python writes to stdout):
```json
{ "jsonrpc": "2.0", "result": { "ports": [...] }, "id": 7 }
```

**Error response**:
```json
{ "jsonrpc": "2.0", "error": { "code": -32000, "message": "Permission denied" }, "id": 7 }
```

Method names are dot-namespaced: `<module>.<function>`. The `id` field is used to match each
response back to its waiting caller — multiple requests can be in flight simultaneously.

---

## The Rust Shell

All logic is in `src-tauri/src/lib.rs`.

### State

```rust
struct SidecarState {
    child: Mutex<Option<CommandChild>>,                              // the Python process
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>, // in-flight calls
    next_id: AtomicU64,                                             // request ID counter
}
```

`pending` is the core of the async bridge: each in-flight `rpc_call` registers a `oneshot::Sender`
under its ID, then suspends. When the background reader sees a response on stdout, it looks up the
ID, removes the sender, and delivers the result.

### `rpc_call` — the single Tauri command

```rust
#[tauri::command]
async fn rpc_call(app: tauri::AppHandle, method: String, params: Value) -> Result<Value, String> {
    match method.as_str() {
        // Fast path: handle certain methods directly in Rust
        "json_tool.format_json" => { /* serde_json reformat, return result */ }
        "json_tool.validate_json" => { /* serde_json parse, return {valid, line, column} */ }

        // Everything else: forward to Python
        _ => {
            let state = app.state::<SidecarState>();
            let id = state.next_id.fetch_add(1, Ordering::Relaxed);

            let request = serde_json::json!({
                "jsonrpc": "2.0", "method": method, "params": params, "id": id,
            });

            // Register response channel BEFORE writing (no race)
            let (tx, rx) = oneshot::channel();
            state.pending.lock()?.insert(id, tx);

            // Write to sidecar stdin
            let child = state.child.lock()?;
            child.as_mut().ok_or("Python sidecar not running")?
                .write(format!("{}\n", serde_json::to_string(&request)?).as_bytes())?;

            // Suspend until the background reader delivers the response
            rx.await.map_err(|_| "Sidecar response channel closed")?
        }
    }
}
```

The fast path exists only for methods called on every keystroke where Rust's `serde_json` is
measurably faster and the sidecar may not be running during pure frontend development. For all
other methods, use the Python path.

### Spawning the sidecar and reading responses

At startup, Tauri spawns the Python binary declared in `tauri.conf.json` under `bundle.externalBin`
and immediately starts a background task to read its stdout:

```rust
// setup closure
let (mut rx, child) = shell.sidecar("devtools-backend")?.spawn()?;
*state.child.lock().unwrap() = Some(child);

tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let response: Value = serde_json::from_str(&String::from_utf8_lossy(&bytes))
                    .unwrap_or(continue);          // skip malformed lines
                let id = response["id"].as_u64().unwrap_or(continue);

                let tx = state.pending.lock().ok()?.remove(&id);
                if let Some(tx) = tx {
                    let result = match response.get("error") {
                        Some(e) => Err(e["message"].as_str().unwrap_or("error").to_string()),
                        None => Ok(response["result"].clone()),
                    };
                    let _ = tx.send(result);
                }
            }
            CommandEvent::Stderr(bytes) => log::warn!("sidecar: {}", String::from_utf8_lossy(&bytes)),
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }
});
```

Sidecar startup failure is a soft error — the app runs without a backend, and only calls that
reach the `_` arm will fail.

---

## The Python Sidecar

### Entry point — `backend/main.py`

```python
def main():
    server = RpcServer()
    register_all_modules(server)

    for line in sys.stdin:          # one JSON object per line
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"jsonrpc":"2.0","error":{"code":-32700,"message":str(e)},"id":None}) + "\n")
            sys.stdout.flush()
            continue

        response = server.handle(request)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()          # critical — without this Rust blocks forever
```

The sidecar is single-threaded and processes requests in order. `sys.stdout.flush()` after every
write is non-negotiable.

### `RpcServer` — `backend/rpc.py`

```python
class RpcServer:
    def __init__(self):
        self._handlers: dict[str, Callable] = {}

    def add(self, method: str, handler: Callable):
        self._handlers[method] = handler

    def handle(self, request: dict) -> dict:
        method = request.get("method")
        params = request.get("params", {})
        rid = request.get("id")

        handler = self._handlers.get(method)
        if not handler:
            return {"jsonrpc":"2.0","error":{"code":-32601,"message":f"Method not found: {method}"},"id":rid}

        try:
            result = handler(**params) if isinstance(params, dict) else handler(*params)
            return {"jsonrpc":"2.0","result":result,"id":rid}
        except Exception as e:
            return {"jsonrpc":"2.0","error":{"code":-32000,"message":str(e)},"id":rid}
```

Dict params are unpacked as keyword arguments — `{"pid": 1234}` becomes `handler(pid=1234)`.
Any uncaught exception becomes a `-32000` error whose message reaches the frontend as a rejected
promise.

### Module registry — `backend/modules/__init__.py`

```python
from modules.json_tool import handlers as json_tool
from modules.port_monitor import handlers as port_monitor

def register_all_modules(server: RpcServer):
    json_tool.register(server)
    port_monitor.register(server)
```

Each module's `handlers.py` exposes a `register(server)` function. Adding a module is two lines
here.

---

## The Frontend

### `src/lib/rpc.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function rpcCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return invoke<T>("rpc_call", { method, params });
}
```

`invoke` crosses the Tauri IPC boundary to the Rust command. `Ok(value)` resolves the promise;
`Err(msg)` rejects it. The generic `<T>` is a TypeScript assertion — there is no runtime
validation.

### Module registration — `src/lib/module-registry.ts`

```typescript
export interface ToolModule {
  id: string;       // kebab-case, unique
  name: string;     // sidebar label
  icon: string;     // lucide-react icon name
  route: string;    // React Router path
  component: LazyExoticComponent<ComponentType>;
}

registerModule({
  id: "port-monitor",
  name: "Ports",
  icon: "network",
  route: "/ports",
  component: lazy(() => import("../modules/port-monitor/PortMonitor")),
});
```

The Shell renders all registered routes inside a `<Suspense>` boundary; the Sidebar lists all
registered modules. No other wiring is needed.

---

## Data Flow

A call to `port_monitor.get_ports` end-to-end:

```
PortMonitor.tsx
  └─ fetchPorts()                           commands.ts
       └─ rpcCall("port_monitor.get_ports") rpc.ts
            └─ invoke("rpc_call", ...)      Tauri IPC
                 └─ rpc_call() in lib.rs
                      ├─ no fast-path match
                      ├─ allocate id=7, create oneshot (tx,rx)
                      ├─ write JSON to Python stdin
                      └─ rx.await  ← suspends

                           Python main.py reads line
                           RpcServer.handle() → get_ports()
                           lsof parsed, result built
                           JSON written to stdout + flush

                      background reader wakes
                      ├─ parse response, id=7
                      ├─ pending.remove(7) → tx
                      └─ tx.send(Ok(result))

                 rx.await resolves → Ok(Value)
            invoke returns { ports: [...] }
       result.ports
  store.setPorts(ports) → re-render
```

---

## Adding a Module

A module has parallel pieces on three layers:

```
backend/modules/<module_name>/
├── __init__.py          # empty — Python package marker
└── handlers.py          # register() + handler functions

src/modules/<module-name>/
├── store.ts             # Zustand state
├── commands.ts          # rpcCall wrappers
└── <ModuleName>.tsx     # React component (default export)
```

### 1. Backend handler

```python
# backend/modules/my_tool/handlers.py
from rpc import RpcServer

def register(server: RpcServer):
    server.add("my_tool.do_thing", do_thing)

def do_thing(input: str) -> dict:
    # params keys → keyword args; return plain dict; raise Exception for errors
    return {"result": input.upper()}
```

### 2. Register in Python

```python
# backend/modules/__init__.py
from modules.my_tool import handlers as my_tool

def register_all_modules(server: RpcServer):
    # ... existing
    my_tool.register(server)
```

### 3. Frontend commands

```typescript
// src/modules/my-tool/commands.ts
import { rpcCall } from "../../lib/rpc";

export async function doThing(input: string): Promise<string> {
  const res = await rpcCall<{ result: string }>("my_tool.do_thing", { input });
  return res.result;
}
```

The object passed as `params` must have keys that exactly match the Python handler's parameter
names — they are forwarded as keyword arguments.

### 4. Frontend store

```typescript
// src/modules/my-tool/store.ts
import { create } from "zustand";

interface MyToolState {
  output: string;
  setOutput: (v: string) => void;
}

export const useMyToolStore = create<MyToolState>()((set) => ({
  output: "",
  setOutput: (output) => set({ output }),
}));
```

### 5. Frontend component

```typescript
// src/modules/my-tool/MyTool.tsx
export default function MyTool() {
  const { output, setOutput } = useMyToolStore();
  return (
    <button onClick={() => doThing("hello").then(setOutput)}>
      Run — {output}
    </button>
  );
}
```

The default export is what `lazy()` loads. No required interface beyond that.

### 6. Register the module

```typescript
// src/lib/module-registry.ts  (append)
registerModule({
  id: "my-tool",
  name: "My Tool",
  icon: "wrench",
  route: "/my-tool",
  component: lazy(() => import("../modules/my-tool/MyTool")),
});
```

The Shell and Sidebar pick it up automatically.

---

## Error Handling

`raise Exception("message")` in any handler propagates all the way to a rejected promise in the
frontend. The full chain:

```
Python raise Exception("msg")
  → rpc.py: {"error": {"code": -32000, "message": "msg"}}
  → lib.rs reader: tx.send(Err("msg"))
  → rpc_call: returns Err to Tauri
  → invoke() rejects
  → rpcCall<T> throws Error("msg")
```

**Common mistakes:**

| Symptom | Cause |
|---|---|
| Promise never resolves | Missing `sys.stdout.flush()` in `main.py` |
| `-32601 Method not found` | Method name typo, or forgot to call `register()` in `__init__.py` |
| `TypeError: unexpected keyword argument` | Param key in TypeScript doesn't match Python parameter name |
| Sidecar crashes on next call | Returned a non-JSON-serializable value (e.g. `datetime`) from a handler |

---

## Checklist

**Backend**
- [ ] `backend/modules/<name>/__init__.py` (empty)
- [ ] `backend/modules/<name>/handlers.py` — `register()` + handler functions returning plain dicts
- [ ] `backend/modules/__init__.py` — import and call `register()`

**Frontend**
- [ ] `src/modules/<name>/store.ts` — Zustand store
- [ ] `src/modules/<name>/commands.ts` — `rpcCall` wrappers with matching param keys
- [ ] `src/modules/<name>/<Name>.tsx` — default-exported component
- [ ] `src/lib/module-registry.ts` — `registerModule(...)` call

**Verify**
- [ ] `cd backend && uv run ruff check .`
- [ ] `npx tsc --noEmit`
- [ ] `npx tauri dev` — module appears in sidebar and first RPC call succeeds
