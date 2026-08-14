import json
import socket
import subprocess
import sys
import threading
import time
import urllib.request


def forward_stderr(stream):
    for line in stream:
        sys.stderr.write(line)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def parse_mcp_body(body):
    text = body.decode("utf-8")
    data_lines = [
        line[5:].strip() for line in text.splitlines() if line.startswith("data:")
    ]
    if data_lines:
        return json.loads("\n".join(data_lines))
    return json.loads(text)


def post(base_url, headers, payload):
    request = urllib.request.Request(
        f"{base_url}/mcp",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        raw = response.read()
        return response.headers, parse_mcp_body(raw) if raw else None


port = free_port()
proc = subprocess.Popen(
    [
        sys.executable,
        "-m",
        "mlops_readme_mcp",
        "--transport",
        "http",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--config",
        "repos.yml",
    ],
    cwd=".",
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

threading.Thread(target=forward_stderr, args=(proc.stderr,), daemon=True).start()
base_url = f"http://127.0.0.1:{port}"

try:
    for _ in range(50):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                break
        except Exception:
            time.sleep(0.1)
    else:
        raise RuntimeError("Python MCP HTTP server did not become ready")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    initialize_headers = None
    initialize = None
    for _ in range(20):
        try:
            initialize_headers, initialize = post(
                base_url,
                headers,
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2026-07-28",
                        "capabilities": {},
                        "clientInfo": {"name": "python-http-smoke", "version": "0.1.0"},
                    },
                },
            )
            break
        except Exception:
            time.sleep(0.1)
    else:
        raise RuntimeError("Python MCP HTTP initialize request failed")
    session_id = initialize_headers.get("Mcp-Session-Id")
    if not session_id:
        raise RuntimeError("Python MCP HTTP server did not return a session ID")

    session_headers = {
        **headers,
        "Mcp-Session-Id": session_id,
    }
    post(
        base_url,
        session_headers,
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    _, tools = post(
        base_url,
        session_headers,
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    _, listed = post(
        base_url,
        session_headers,
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "list_repositories", "arguments": {}},
        },
    )
    repos = json.loads(listed["result"]["content"][0]["text"])

    print(
        json.dumps(
            {
                "initialized": initialize["result"]["serverInfo"],
                "sessionId": bool(session_id),
                "toolNames": sorted(tool["name"] for tool in tools["result"]["tools"]),
                "repoCount": len(repos),
            },
            indent=2,
        )
    )
finally:
    proc.terminate()
    proc.wait(timeout=5)
