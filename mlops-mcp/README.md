# MLOps README MCP

mcp-name: com.example/mlops-readmes

Bu MCP server, Python ile yazılmıştır. YAML dosyasındaki GitHub repo adreslerinden README içeriklerini çeker, 7 gün boyunca cache'ler ve modellere MCP tool/resource olarak sunar.

## Kurulum

```bash
uv sync
```

Repo listesi `repos.yml` içinden değiştirilir. Cache süresi aynı dosyadaki `cache.ttl_days` değerinden ayarlanır.

```bash
uv run mlops-readme-mcp --config repos.yml
```

Private repo veya daha yüksek GitHub API limiti için `GITHUB_TOKEN` ortam değişkeni verilebilir:

```bash
GITHUB_TOKEN=ghp_xxx uv run mlops-readme-mcp --config repos.yml
```

## Merkezi YAML Kullanımı

Şirket içinde her kullanıcıya `repos.yml` kopyalatmak yerine merkezi bir HTTPS adresindeki YAML dosyası kullanılabilir:

```bash
uv run mlops-readme-mcp --config-url https://config.example.com/mlops/repos.yml
```

Aynı değer `MCP_REPOS_CONFIG_URL` ortam değişkeninden de okunur.

## OpenShift / Remote HTTP

MCP server sürekli çalışan bir process olarak OpenShift’te yayınlanabilir. Python tarafı `streamable-http` transport kullanır:

```bash
uv run mlops-readme-mcp --transport http --port 8080 --host 0.0.0.0 --config repos.yml
```

- MCP endpoint: `/mcp`
- Copilot config: `type: http` ve `url: https://<route-host>/mcp`

OpenShift manifestleri `openshift/` klasöründe, adım adım kurulum [docs/openshift-deployment.md](docs/openshift-deployment.md) içinde.

Bugünkü OpenShift ve Copilot kurulumunu uçtan uca kapatmak için [docs/KURULUM.md](docs/KURULUM.md) dosyasını kullanın.

## GitHub Copilot Chat (VS Code)

Projeyi VS Code'da açtığınızda `.vscode/mcp.json` hazır şekilde gelir. `uv sync` çalıştırıldıktan sonra:

1. VS Code'da `MCP: List Servers` komutunu çalıştırın.
2. `mlops-readmes` server'ını görürseniz `Start` deyin.
3. Copilot Chat'te `Agent` modunda tools listesinden README tool'larını kullanın.

## GitHub.com Copilot Cloud Agent

`copilot-mcp.example.json` içindeki JSON, PyPI'ye yayınlanmış `mlops-readme-mcp` paketiyle çalışır. Repository Settings > Copilot > MCP servers alanına yapıştırmadan önce paket adını ve config URL'ini şirket değerleriyle değiştirin.

Şirket geneli dağıtım adımları için [docs/enterprise-deployment.md](docs/enterprise-deployment.md) dosyasına bakın. Registry metadata örneği `registry/server.json`, kurumsal allowlist örneği `managed-settings.example.json`, org-level Copilot agent örneği `agents/mlops-readmes.agent.md` içindedir.

## Tools

- `list_repositories`: YAML'daki repo listesini ve cache durumunu döner.
- `get_repository_readmes`: Tüm veya seçili repo README'lerini modellere verir.
- `refresh_repository_readmes`: Cache'i beklemeden GitHub'dan günceller.

Her repo ayrıca `readme://<repo-id>` resource olarak kullanılabilir.

## Testler

```bash
make smoke
make smoke-http
make smoke-config-url
```

## Araştırma Özeti

- MCP sunucuları; tools, resources ve prompts sunabilir. GitHub Copilot cloud agent şu anda yalnızca MCP tools destekliyor, resources/prompts desteklemiyor.
- VS Code Copilot Chat, `.vscode/mcp.json` veya kişisel `settings.json` üzerinden local stdio server ekleyebiliyor.
- GitHub.com repo ayarları, `mcpServers` formatındaki JSON ile local veya remote MCP sunucularını Copilot cloud agent ve code review için kullanabiliyor.
- Resmi kaynaklar: [MCP](https://modelcontextprotocol.io), [GitHub Copilot Chat MCP](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp), [GitHub repo MCP ayarları](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).
