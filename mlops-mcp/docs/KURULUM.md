# Kurulum Rehberi

Bu rehber Python MCP server’ı lokal, OpenShift ve GitHub Copilot tarafında bugün çalışır hale getirmek için yazılmıştır.

## 1. Ön Koşullar

- `uv` yüklü olmalı: `uv --version`
- Python 3.11 veya üzeri
- OpenShift kurulumu için `oc` CLI
- GitHub Copilot erişimi
- OpenShift remote kurulum için HTTPS route erişimi

## 2. Lokal Kurulum

```bash
uv sync
```

Server’ı stdio modunda başlat:

```bash
uv run mlops-readme-mcp --config repos.yml
```

Private repo veya daha yüksek GitHub API limiti için:

```bash
GITHUB_TOKEN=ghp_xxx uv run mlops-readme-mcp --config repos.yml
```

Merkezi YAML kullanmak için:

```bash
uv run mlops-readme-mcp --config-url https://config.example.com/mlops/repos.yml
```

`MCP_REPOS_CONFIG_URL` ortam değişkeni de aynı amaca yarar.

## 3. Test

```bash
make smoke
make smoke-http
make smoke-config-url
```

Üç test de geçerse stdio, streamable-http ve merkezi YAML yükleme çalışıyor demektir.

## 4. OpenShift Kurulumu

### 4.1 Image Build ve Push

Proje kökünde:

```bash
docker build -t mlops-readme-mcp:0.1.0 .
```

OpenShift internal registry kullanıyorsanız:

```bash
docker tag mlops-readme-mcp:0.1.0 image-registry.openshift-image-registry.svc:5000/CHANGE_NAMESPACE/mlops-readme-mcp:latest
docker push image-registry.openshift-image-registry.svc:5000/CHANGE_NAMESPACE/mlops-readme-mcp:latest
```

`CHANGE_NAMESPACE` yerine OpenShift namespace adını yazın.

### 4.2 ConfigMap ve Secret

Repo listesini OpenShift ConfigMap’e koyuyoruz:

```bash
oc create configmap mlops-readmes-config --from-file=repos.yml=openshift/repos.yml
```

GitHub token kullanacaksanız:

```bash
oc create secret generic mlops-readmes-github-token --from-literal=token=CHANGE_ME
```

Token opsiyoneldir; deployment içinde `optional: true` tanımlıdır.

### 4.3 Deployment, Service ve Route

```bash
oc apply -f openshift/deployment.yaml
oc apply -f openshift/service.yaml
oc apply -f openshift/route.yaml
```

Durumu kontrol et:

```bash
oc get pods -l app=mlops-readmes-mcp
oc logs deploy/mlops-readmes-mcp
```

Route host’unu al:

```bash
oc get route mlops-readmes-mcp -o jsonpath='https://{.spec.host}{"\n"}'
```

### 4.4 OpenShift MCP Endpoint Testi

```bash
curl -i -X POST https://ROUTE/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2026-07-28",
      "capabilities": {},
      "clientInfo": {"name": "curl", "version": "0.1.0"}
    }
  }'
```

Bu istek `mcp-session-id` header’ı ve server bilgisi döndürmelidir.

## 5. GitHub Copilot Bağlantısı

### 5.1 VS Code Copilot Chat

Proje root’unda `.vscode/mcp.json` hazırdır:

```json
{
  "servers": {
    "mlops-readmes": {
      "type": "stdio",
      "command": "./.venv/bin/mlops-readme-mcp",
      "args": ["--config", "./repos.yml"]
    }
  }
}
```

Adımlar:

1. `uv sync` çalıştır.
2. VS Code’da `.vscode/mcp.json` dosyasını aç.
3. `mlops-readmes` server’ının yanındaki **Start** butonuna bas.
4. Copilot Chat’te **Agent** moduna geç.
5. Tools listesinden `get_repository_readmes`, `list_repositories`, `refresh_repository_readmes` kullan.

Kontrol komutu:

```text
MCP: List Servers
```

### 5.2 VS Code ile Remote OpenShift Server

OpenShift route’u hazırsa:

```json
{
  "servers": {
    "mlops-readmes": {
      "type": "http",
      "url": "https://ROUTE/mcp"
    }
  }
}
```

### 5.3 GitHub.com Repo Ayarları

`copilot-mcp.example.json` içindeki JSON’u repository Settings > Copilot > MCP servers alanına yapıştırın.

PyPI paketi ve config URL’i şirket değerlerine göre değiştirin:

```json
{
  "mcpServers": {
    "mlops-readmes": {
      "type": "local",
      "command": "uvx",
      "args": [
        "mlops-readme-mcp",
        "--config-url",
        "https://config.example.com/mlops/repos.yml"
      ],
      "env": {
        "GITHUB_TOKEN": "$COPILOT_MCP_GITHUB_TOKEN"
      },
      "tools": [
        "list_repositories",
        "get_repository_readmes",
        "refresh_repository_readmes"
      ]
    }
  }
}
```

Cloud agent kullanacaksa `COPILOT_MCP_GITHUB_TOKEN` adında Agents secret tanımlayın.

### 5.4 Organization-Level Copilot Agent

`agents/mlops-readmes.agent.md` dosyasını organization’ın `.github-private` reposuna `agents/mlops-readmes.agent.md` olarak kopyalayın.

Bu dosya:

- `mlops-readmes` agent’ını tanımlar
- PyPI üzerinden `uvx mlops-readme-mcp` çalıştırır
- Yalnızca MLOps README tool’larını açar
- `COPILOT_MCP_GITHUB_TOKEN` secret’ını kullanır

Kullanıcılar Copilot cloud agent’ta agent dropdown’ından `mlops-readmes` seçebilir.

## 6. Yapılandırma Dosyaları

- `repos.yml`: çekilecek repo adresleri ve cache süresi
- `openshift/repos.yml`: OpenShift ConfigMap’e konulan repo listesi
- `openshift/deployment.yaml`: OpenShift deployment tanımı
- `openshift/service.yaml`: OpenShift service tanımı
- `openshift/route.yaml`: OpenShift HTTPS route tanımı
- `.vscode/mcp.json`: VS Code local Copilot ayarı
- `copilot-mcp.example.json`: GitHub.com repo MCP ayarı
- `registry/server.json`: MCP Registry yayınlama metadata’sı
- `managed-settings.example.json`: kurumsal MCP allowlist örneği

## 7. Bugün Kapatma Checklist’i

- [ ] `uv sync` çalıştı
- [ ] `make smoke` geçti
- [ ] `make smoke-http` geçti
- [ ] `make smoke-config-url` geçti
- [ ] OpenShift image push edildi
- [ ] ConfigMap oluşturuldu
- [ ] Deployment, Service ve Route apply edildi
- [ ] Route üzerinden MCP initialize testi geçti
- [ ] VS Code’da MCP server Start edildi
- [ ] Copilot Chat’te README tool’ları görüldü

## 8. Sorun Giderme

- GitHub API rate limit alıyorsanız `GITHUB_TOKEN` veya `COPILOT_MCP_GITHUB_TOKEN` tanımlayın.
- Remote Copilot cloud agent OAuth desteklemediği için route’u OAuth’sız HTTPS olarak bırakın.
- OpenShift deployment `replicas: 1` kullanır çünkü streamable-http stateful session kullanıyor. Replica artırmak için sticky session veya stateless transport gerekir.
- `uvx` komutu için paketin PyPI veya şirket içi Python registry’sinde yayınlanmış olması gerekir.
- `oc get pods` içinde `CrashLoopBackOff` varsa `oc logs deploy/mlops-readmes-mcp` ile hatayı kontrol edin.
