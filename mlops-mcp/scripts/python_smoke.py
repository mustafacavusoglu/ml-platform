import json
import subprocess
import sys
import threading


def forward_stderr(stream):
    for line in stream:
        sys.stderr.write(line)


proc = subprocess.Popen(
    [sys.executable, "-m", "mlops_readme_mcp", "--config", "repos.yml"],
    cwd=".",
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

threading.Thread(target=forward_stderr, args=(proc.stderr,), daemon=True).start()
next_id = 1


def send(method, params=None, message_id=None):
    global next_id
    if message_id is None:
        message_id = next_id
        next_id += 1
    proc.stdin.write(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": message_id,
                "method": method,
                "params": params or {},
            }
        )
        + "\n"
    )
    proc.stdin.flush()

    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("MCP Python stdio server closed unexpectedly")
        message = json.loads(line)
        if message.get("id") == message_id:
            return message


try:
    initialize = send(
        "initialize",
        {
            "protocolVersion": "2026-07-28",
            "capabilities": {},
            "clientInfo": {"name": "python-smoke", "version": "0.1.0"},
        },
    )
    proc.stdin.write(
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
    )
    proc.stdin.flush()

    tools = send("tools/list")
    listed = send(
        "tools/call",
        {"name": "list_repositories", "arguments": {}},
    )
    repos = json.loads(listed["result"]["content"][0]["text"])

    print(
        json.dumps(
            {
                "initialized": initialize["result"]["serverInfo"],
                "toolNames": sorted(tool["name"] for tool in tools["result"]["tools"]),
                "repoCount": len(repos),
            },
            indent=2,
        )
    )
finally:
    proc.terminate()
    proc.wait(timeout=5)
