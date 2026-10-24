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
make test
```

Testler stdio, stateless HTTP, bearer token, cache, GitHub kesintisinde eski cache'e düşme ve merkezi YAML yüklemeyi kapsar. Ağ erişimi gerektirmez.

## 4. OpenShift Kurulumu

Adım adım: [openshift-deployment.md](openshift-deployment.md). Kısaca:

```bash
oc project <namespace>
oc create secret generic mlops-readmes-mcp --from-literal=auth-token="$(openssl rand -hex 32)"
make deploy
```

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

Token'lı HTTP bağlantı örneği için [openshift-deployment.md → Copilot Bağlantısı](openshift-deployment.md#5-copilot-bağlantısı).

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
- `openshift/`: Kustomize paketi (`oc apply -k openshift/`), kendi `repos.yml`'i dahil
- `.vscode/mcp.json`: VS Code local Copilot ayarı
- `copilot-mcp.example.json`: GitHub.com repo MCP ayarı (local/uvx)
- `registry/server.json`: MCP Registry yayınlama metadata'sı
- `managed-settings.example.json`: kurumsal MCP allowlist örneği

## 7. Checklist

- [ ] `uv sync` ve `make test` geçti
- [ ] `mlops-readmes-mcp` secret'ı (`auth-token`) oluşturuldu
- [ ] `make deploy` tamamlandı, `curl https://ROUTE/healthz` 200 dönüyor
- [ ] VS Code'da MCP server Start edildi, Copilot Chat'te README tool'ları görüldü

## 8. Sorun Giderme

- GitHub API rate limit alıyorsanız `GITHUB_TOKEN` veya `COPILOT_MCP_GITHUB_TOKEN` tanımlayın.
- `uvx` komutu için paketin PyPI veya şirket içi Python registry'sinde yayınlanmış olması gerekir.
- OpenShift sorunları için [openshift-deployment.md → Sorun Giderme](openshift-deployment.md#sorun-giderme).
