# Şirket Geneli MCP Dağıtımı

Bu MCP’yi tüm data science kullanıcılarına yaymak için iki hedef ayrımı yapmak gerekiyor:

1. VS Code / IDE Copilot Chat: kullanıcıların makinesinde çalışan local MCP server.
2. GitHub.com Copilot cloud agent: GitHub Actions ortamında çalışan MCP server.

Önerilen kurulum, Python paketini PyPI’ye (veya şirket içi Python paket registry’sine) yayınlamak ve merkezi YAML config URL’ini `--config-url` ile server’a vermek. Böylece kullanıcı başına `repos.yml` dosyası kopyalamak gerekmez.

## 1. Paketi ve Merkezi YAML’ı Hazırla

1. `registry/server.json` içindeki namespace, PyPI paket adı ve config URL değerlerini şirket değerleriyle değiştir.
2. `uv sync`, `uv build` ve `uv publish` çalıştırıp paketi şirketin iç Python registry’sine yayınla.
3. `repos.yml` dosyasını HTTPS’ten erişilebilir bir yere koy. Örnek: GitHub Pages, iç statik file server veya Azure Blob.
4. Gerekirse `GITHUB_TOKEN` için şirket secret’ı tanımla.

## 2. VS Code Copilot Chat İçin

### Kısa yol: MCP registry

1. Şirket içi MCP registry’yi ayağa kaldır veya Azure API Center kullan.
2. Registry’ye `registry/server.json` içindeki server’ı ekle.
3. Enterprise ya da organization Copilot policies altında:
   - **MCP servers in Copilot**: Enabled.
   - **MCP Registry URL**: şirket registry URL’i.
   - **Restrict MCP access to registry servers**: Registry only veya Allow all.
4. Kullanıcılar VS Code’da `@mcp mlops-readmes` aramasıyla server’ı kurup **Start** deyince Copilot Chat’te kullanabilir.

### Zorunlu güvenlik katmanı: managed settings allowlist

Registry public preview’da ve kullanıcı tarafından değiştirilebilir. Kurumsal kısıtlama için `.github-private/managed-settings.json` veya MDM ile `allowedMcpServers` tanımla. Örnek: `managed-settings.example.json`.

Allowlist komutu, registry’nin gerçekte başlattığı komutla birebir eşleşmeli. Bu yüzden PyPI paket adı veya `--config-url` değişirse `managed-settings.example.json`’ı da güncelle.

### Pilot yol: workspace template

Registry kurmak istemiyorsanız `.vscode/mcp.json` dosyasını data science takımının ortak workspace template’ine ekleyin. Kullanıcılar VS Code’da dosyayı açıp **Start** demeli. Bu yöntem her kullanıcıda el ile başlatma gerektirir.

## 3. GitHub.com Copilot Cloud Agent İçin

1. `agents/mlops-readmes.agent.md` dosyasını organization’ın `.github-private` reposuna `agents/mlops-readmes.agent.md` olarak kopyala.
2. Organization seviyesinde `COPILOT_MCP_GITHUB_TOKEN` adında bir Agents secret tanımla.
3. `mcp-servers` içindeki PyPI paket adı ve `--config-url` değerlerini şirket değerleriyle değiştir.
4. Copilot cloud agent kullanıcıları artık agent dropdown’ından `mlops-readmes` seçebilir.

Alternatif olarak `copilot-mcp.example.json` içindeki JSON, repository Settings > Copilot > MCP servers alanına da yapıştırılabilir; ama bu yalnızca o repository için geçerli olur.

## Resmi Kaynaklar

- MCP registry: https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-registry
- MCP allowlist: https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-enterprise-allowlist
- Custom agents: https://docs.github.com/en/copilot/reference/custom-agents-configuration
- Registry API: https://registry.modelcontextprotocol.io/docs
