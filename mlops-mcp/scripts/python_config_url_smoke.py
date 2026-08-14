import http.server
import json
import socketserver
import subprocess
import sys
import threading


def forward_stderr(stream):
    for line in stream:
        sys.stderr.write(line)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/repos.yml":
            body = open("repos.yml", "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "text/yaml")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, _format, *_args):
        return


server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
server_thread = threading.Thread(target=server.serve_forever, daemon=True)
server_thread.start()
port = server.server_address[1]
config_url = f"http://127.0.0.1:{port}/repos.yml"

proc = subprocess.Popen(
    [sys.executable, "-m", "mlops_readme_mcp", "--config-url", config_url],
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
    send(
        "initialize",
        {
            "protocolVersion": "2026-07-28",
            "capabilities": {},
            "clientInfo": {"name": "python-config-url-smoke", "version": "0.1.0"},
        },
    )
    proc.stdin.write(
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
    )
    proc.stdin.flush()
    listed = send(
        "tools/call",
        {"name": "list_repositories", "arguments": {}},
    )
    repos = json.loads(listed["result"]["content"][0]["text"])
    print(
        json.dumps(
            {
                "configUrl": config_url,
                "repoCount": len(repos),
                "repoIds": [repo["id"] for repo in repos],
            },
            indent=2,
        )
    )
finally:
    proc.terminate()
    proc.wait(timeout=5)
    server.shutdown()
