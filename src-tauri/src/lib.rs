use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    next_id: AtomicU64,
}

#[tauri::command]
async fn rpc_call(
    app: tauri::AppHandle,
    method: String,
    params: Value,
) -> Result<Value, String> {
    // Handle methods directly in Rust (fast path)
    match method.as_str() {
        "json_tool.format_json" => {
            let content = params
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing content parameter")?;
            let indent = params
                .get("indent")
                .and_then(|v| v.as_u64())
                .unwrap_or(2) as usize;

            let parsed: Value =
                serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {}", e))?;

            let formatted = if indent == 0 {
                serde_json::to_string(&parsed).map_err(|e| e.to_string())?
            } else {
                let buf = Vec::new();
                let indent_bytes = b" ".repeat(indent);
                let formatter =
                    serde_json::ser::PrettyFormatter::with_indent(&indent_bytes);
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
        // Forward all other methods to the Python sidecar
        _ => {
            let state = app.state::<SidecarState>();
            let id = state.next_id.fetch_add(1, Ordering::Relaxed);

            let request = serde_json::json!({
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
                "id": id,
            });

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

            // Await the response from the background reader
            rx.await
                .map_err(|_| "Sidecar response channel closed".to_string())?
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState {
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn Python sidecar
            let shell = app.shell();
            match shell.sidecar("devtools-backend") {
                Ok(command) => match command.spawn() {
                    Ok((mut rx, child)) => {
                        let state = app.state::<SidecarState>();
                        *state.child.lock().unwrap() = Some(child);
                        log::info!("Python sidecar started");

                        // Background task: read sidecar stdout and route responses
                        let app_handle = app.handle().clone();
                        tauri::async_runtime::spawn(async move {
                            while let Some(event) = rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line_bytes) => {
                                        let line = String::from_utf8_lossy(&line_bytes);
                                        let response: Value = match serde_json::from_str(&line) {
                                            Ok(v) => v,
                                            Err(_) => continue,
                                        };

                                        let id = match response.get("id").and_then(|v| v.as_u64())
                                        {
                                            Some(id) => id,
                                            None => continue,
                                        };

                                        let state = app_handle.state::<SidecarState>();
                                        let tx = state.pending.lock().ok().and_then(|mut map| map.remove(&id));

                                        if let Some(tx) = tx {
                                            let result = if let Some(err) = response.get("error") {
                                                let msg = err
                                                    .get("message")
                                                    .and_then(|m| m.as_str())
                                                    .unwrap_or("Unknown sidecar error");
                                                Err(msg.to_string())
                                            } else {
                                                Ok(response
                                                    .get("result")
                                                    .cloned()
                                                    .unwrap_or(Value::Null))
                                            };
                                            let _ = tx.send(result);
                                        }
                                    }
                                    CommandEvent::Stderr(err_bytes) => {
                                        let msg = String::from_utf8_lossy(&err_bytes);
                                        log::warn!("Sidecar stderr: {}", msg);
                                    }
                                    CommandEvent::Terminated(payload) => {
                                        log::info!(
                                            "Sidecar terminated with code: {:?}",
                                            payload.code
                                        );
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
                    }
                    Err(e) => {
                        log::warn!(
                            "Failed to spawn sidecar: {}. Running without backend.",
                            e
                        );
                    }
                },
                Err(e) => {
                    log::warn!("Sidecar not found: {}. Running without backend.", e);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![rpc_call])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
