"""Cron manager — reads and manages the system crontab as the single source of truth."""

import os
import re
import subprocess
import threading
import uuid

from rpc import RpcServer

MARKER_PREFIX = "# devtools:"
DISABLE_PREFIX = "# DISABLED: "

# In-memory store for background job runs: run_id -> {output, done, exit_code}
_runs: dict[str, dict] = {}
_runs_lock = threading.Lock()


def register(server: RpcServer):
    server.add("cron_manager.get_jobs", get_jobs)
    server.add("cron_manager.add_job", add_job)
    server.add("cron_manager.update_job", update_job)
    server.add("cron_manager.delete_job", delete_job)
    server.add("cron_manager.toggle_job", toggle_job)
    server.add("cron_manager.run_now", run_now)
    server.add("cron_manager.get_run_output", get_run_output)
    server.add("cron_manager.validate_expression", validate_expression)


# ─── Crontab I/O ──────────────────────────────────────────────────────────────

def _read_crontab() -> str:
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else ""


def _write_crontab(content: str) -> None:
    proc = subprocess.Popen(
        ["crontab", "-"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    _, stderr = proc.communicate(input=content)
    if proc.returncode != 0:
        raise Exception(f"Failed to write crontab: {stderr.strip()}")


# ─── Parsing ──────────────────────────────────────────────────────────────────

def _parse_cron_line(line: str) -> tuple[str, str] | None:
    """Extract (cronExpression, command) from a standard 5-field cron line."""
    m = re.match(r"^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$", line.strip())
    return (m.group(1), m.group(2)) if m else None


def _parse_crontab(content: str) -> list[dict]:
    jobs: list[dict] = []
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith(MARKER_PREFIX):
            # Managed job — format: # devtools:<uuid> <name>
            rest = line[len(MARKER_PREFIX):]
            parts = rest.split(" ", 1)
            job_id = parts[0].strip()
            name = parts[1].strip() if len(parts) > 1 else ""
            i += 1
            if i < len(lines):
                next_line = lines[i]
                is_enabled = True
                if next_line.startswith(DISABLE_PREFIX):
                    is_enabled = False
                    next_line = next_line[len(DISABLE_PREFIX):]
                parsed = _parse_cron_line(next_line)
                if parsed:
                    cron_expr, command = parsed
                    jobs.append({
                        "id": job_id,
                        "name": name,
                        "cronExpression": cron_expr,
                        "command": command,
                        "isEnabled": is_enabled,
                        "source": "devtools",
                    })
        elif line.strip() and not line.startswith("#"):
            # External job not managed by devtools
            parsed = _parse_cron_line(line)
            if parsed:
                cron_expr, command = parsed
                jobs.append({
                    "id": f"ext-{abs(hash(line))}",
                    "name": "",
                    "cronExpression": cron_expr,
                    "command": command,
                    "isEnabled": True,
                    "source": "external",
                })
        i += 1
    return jobs


def _build_crontab(devtools_jobs: list[dict], original_content: str) -> str:
    """Reconstruct crontab preserving all non-devtools lines (comments, env vars, external jobs)."""
    preserved: list[str] = []
    lines = original_content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith(MARKER_PREFIX):
            i += 2  # skip marker + job line
            continue
        preserved.append(line)
        i += 1

    # Strip trailing blank lines
    while preserved and not preserved[-1].strip():
        preserved.pop()

    result_lines = preserved[:]
    for job in devtools_jobs:
        cron_line = f"{job['cronExpression']} {job['command']}"
        if not job["isEnabled"]:
            cron_line = f"{DISABLE_PREFIX}{cron_line}"
        result_lines.append(f"{MARKER_PREFIX}{job['id']} {job['name']}")
        result_lines.append(cron_line)

    content = "\n".join(result_lines)
    if content and not content.endswith("\n"):
        content += "\n"
    return content


# ─── RPC handlers ─────────────────────────────────────────────────────────────

def get_jobs() -> dict:
    return {"jobs": _parse_crontab(_read_crontab())}


def add_job(name: str, cronExpression: str, command: str) -> dict:
    content = _read_crontab()
    devtools_jobs = [j for j in _parse_crontab(content) if j["source"] == "devtools"]
    new_job = {
        "id": str(uuid.uuid4()),
        "name": name,
        "cronExpression": cronExpression,
        "command": command,
        "isEnabled": True,
        "source": "devtools",
    }
    devtools_jobs.append(new_job)
    _write_crontab(_build_crontab(devtools_jobs, content))
    return {"job": new_job}


def update_job(id: str, name: str | None = None, cronExpression: str | None = None, command: str | None = None) -> dict:
    content = _read_crontab()
    devtools_jobs = [j for j in _parse_crontab(content) if j["source"] == "devtools"]
    target = next((j for j in devtools_jobs if j["id"] == id), None)
    if not target:
        raise Exception(f"Job {id} not found")
    if name is not None:
        target["name"] = name
    if cronExpression is not None:
        target["cronExpression"] = cronExpression
    if command is not None:
        target["command"] = command
    _write_crontab(_build_crontab(devtools_jobs, content))
    return {"job": target}


def delete_job(id: str) -> dict:
    content = _read_crontab()
    devtools_jobs = [j for j in _parse_crontab(content) if j["source"] == "devtools" and j["id"] != id]
    _write_crontab(_build_crontab(devtools_jobs, content))
    return {"ok": True}


def toggle_job(id: str, enabled: bool) -> dict:
    content = _read_crontab()
    devtools_jobs = [j for j in _parse_crontab(content) if j["source"] == "devtools"]
    target = next((j for j in devtools_jobs if j["id"] == id), None)
    if not target:
        raise Exception(f"Job {id} not found")
    target["isEnabled"] = enabled
    _write_crontab(_build_crontab(devtools_jobs, content))
    return {"ok": True}


def run_now(id: str) -> dict:
    """Execute a job immediately in the background; returns a run_id for polling."""
    content = _read_crontab()
    job = next((j for j in _parse_crontab(content) if j["id"] == id), None)
    if not job:
        raise Exception(f"Job {id} not found")

    run_id = str(uuid.uuid4())
    with _runs_lock:
        _runs[run_id] = {"output": "", "done": False, "exit_code": None}

    def _execute():
        shell = os.environ.get("SHELL", "/bin/sh")
        try:
            proc = subprocess.Popen(
                [shell, "-l", "-c", job["command"]],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            for line in proc.stdout or []:
                with _runs_lock:
                    _runs[run_id]["output"] += line
            proc.wait()
            with _runs_lock:
                _runs[run_id]["done"] = True
                _runs[run_id]["exit_code"] = proc.returncode
        except Exception as e:
            with _runs_lock:
                _runs[run_id]["output"] += f"Error: {e}\n"
                _runs[run_id]["done"] = True
                _runs[run_id]["exit_code"] = 1

    threading.Thread(target=_execute, daemon=True).start()
    return {"run_id": run_id}


def get_run_output(run_id: str) -> dict:
    with _runs_lock:
        run = _runs.get(run_id)
    if not run:
        raise Exception(f"Run {run_id} not found")
    return {"output": run["output"], "done": run["done"], "exit_code": run["exit_code"]}


def validate_expression(expression: str) -> dict:
    """Basic 5-field cron syntax validation (no external deps)."""
    parts = expression.strip().split()
    if len(parts) != 5:
        return {"valid": False, "error": f"Expected 5 fields, got {len(parts)}"}

    field_ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
    field_names = ["minute", "hour", "day", "month", "weekday"]

    for part, (lo, hi), fname in zip(parts, field_ranges, field_names):
        if part == "*":
            continue
        for token in part.split(","):
            base = token.split("/")[0]
            if base == "*":
                continue
            for v in base.split("-"):
                try:
                    n = int(v)
                    if not (lo <= n <= hi):
                        return {"valid": False, "error": f"{fname} value {n} out of range {lo}–{hi}"}
                except ValueError:
                    return {"valid": False, "error": f"Invalid {fname} value: {v!r}"}

    return {"valid": True, "error": None}
