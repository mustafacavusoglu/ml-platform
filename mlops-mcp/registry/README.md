# MCP Registry Publishing

`server.json` is the MCP Registry metadata for publishing this server to a registry. It uses a PyPI package identifier and passes a central YAML config URL through `--config-url`.

Before publishing:

1. Replace `com.example/mlops-readmes` and `mlops-readme-mcp` with your company namespace and PyPI package.
2. Replace `https://config.example.com/mlops/repos.yml` with an HTTPS URL that serves the company-wide `repos.yml`.
3. Run `uv sync`, `uv build`, then `uv publish`.
4. For the official registry, install `mcp-publisher`, run `mcp-publisher init`, copy the relevant fields from `server.json`, then run `mcp-publisher validate` and `mcp-publisher publish`.
5. For a private/company registry, host the official MCP Registry or Azure API Center, add this server, and configure the registry URL in Copilot policies.

The registry v0.1 endpoints expected by Copilot are:

```text
GET /v0.1/servers
GET /v0.1/servers/{serverName}/versions/latest
GET /v0.1/servers/{serverName}/versions/{version}
```

All `/v0.1/servers` endpoints must return CORS headers:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```
