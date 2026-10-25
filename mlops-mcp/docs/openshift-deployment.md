# OpenShift Deployment

Server OpenShift'te **stateless streamable-http** modunda çalışır: session tutmaz, cevapları düz JSON döner. Bu yüzden sticky session gerekmez, birden fazla replica çalışabilir ve HAProxy router SSE buffering sorunu çıkarmaz.

`openshift/` klasörü tek bir Kustomize paketidir:

| Dosya | İçerik |
|---|---|
| `kustomization.yaml` | Hepsini bağlar, `repos.yml`'den ConfigMap üretir |
| `build.yaml` | ImageStream + binary Docker BuildConfig |
| `deployment.yaml` | 2 replica, `/healthz` probe'ları, resource limitleri, restricted SCC uyumlu securityContext |
| `service.yaml` / `route.yaml` | HTTPS edge route (HTTP → HTTPS redirect, 120 sn timeout) |
| `repos.yml` | Repo listesi (cache `/tmp`, pod başına emptyDir) |

## 0. Ön Koşullar

- `oc` CLI ile cluster'a giriş yapılmış olmalı (`oc login ...`), `make` kurulu olmalı.
- Namespace'te BuildConfig, ImageStream, Deployment, Service ve Route oluşturma yetkiniz olmalı (`admin` veya `edit` rolü yeterli).
- **Ağ erişimi:**

  | Ne zaman | Nereye | Erişim yoksa |
  |---|---|---|
  | Image build | `ghcr.io`, `docker.io` (base image'lar) | `UV_IMAGE` / `PYTHON_IMAGE` build arg'larıyla Nexus mirror'ı verin |
  | Image build | `pypi.org` (Python paketleri) | Image'ı CI'da build edin (aşağıdaki Nexus notu) |
  | Çalışırken | `api.github.com` | Proxy ayarı yapın (bkz. [Proxy](#proxy)) |

## 1. Repo Listesini Doldurun

`openshift/repos.yml` bir şablondur: içindeki `your-org` adreslerini şirketin gerçek GitHub organization ve repo adlarıyla değiştirin. Doldurulmamış adresler için tool'lar "README not found" hatası döner. Her repo için `description` alanını kullanıcının soracağı kelimelerle yazın; Copilot hangi repoyu okuyacağını buna bakarak seçer.

## 2. Secret

- **`github-token`:** Şirket repoları private ise **zorunludur**. Okunacak repolarda `Contents: Read` yetkisi olan bir fine-grained token ya da `repo` scope'lu bir token kullanın. Kişisel hesap yerine bir servis hesabı tercih edin.
- **`auth-token`:** Önerilir. Route dışarı açıksa token olmadan herkes tool'ları çağırabilir ve `github-token` ile okunan private README'leri görebilir.

```bash
oc create secret generic mlops-readmes-mcp \
  --from-literal=auth-token="$(openssl rand -hex 32)" \
  --from-literal=github-token=ghp_xxx
```

## 3. Kurulum

```bash
oc project <namespace>
make deploy
```

`make deploy` sırasıyla şunları yapar:

```bash
oc apply -k openshift/                                   # ImageStream, BuildConfig, ConfigMap, Deployment, Service, Route
oc start-build mlops-readme-mcp --from-dir=. --follow    # Image'ı cluster içinde build eder
oc rollout status deploy/mlops-readmes-mcp               # Image trigger yeni pod'ları başlatır
```

İlk `oc apply` sonrası pod'lar build bitene kadar `ImagePullBackOff` gösterir; bu normaldir.

**Image CI'da build edilip Nexus'a push ediliyorsa:** `kustomization.yaml` içinden `build.yaml`'ı çıkarın ve yorumdaki `images:` bloğunu açın. Base image'lar Nexus mirror'ından çekilecekse Dockerfile'daki `UV_IMAGE` / `PYTHON_IMAGE` build arg'larını verin (BuildConfig'te örnek var).

## 4. Repo Listesini Güncelleme

Kurulumdan sonra `openshift/repos.yml`'i düzenleyip `oc apply -k openshift/` çalıştırın. ConfigMap adı hash'li olduğu için pod'lar otomatik yeniden başlar.

## 5. Kontrol

```bash
ROUTE=$(oc get route mlops-readmes-mcp -o jsonpath='{.spec.host}')
TOKEN=$(oc get secret mlops-readmes-mcp -o jsonpath='{.data.auth-token}' | base64 -d)

curl -s https://$ROUTE/healthz

curl -s https://$ROUTE/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_repositories","arguments":{}}}'
```

## 6. Copilot Bağlantısı

**VS Code** (`.vscode/mcp.json` veya kullanıcı `settings.json`) — token bir kere sorulur, VS Code secret storage'da saklanır:

```json
{
  "inputs": [
    { "id": "mlops-mcp-token", "type": "promptString", "description": "MLOps MCP token", "password": true }
  ],
  "servers": {
    "mlops-readmes": {
      "type": "http",
      "url": "https://ROUTE/mcp",
      "headers": { "Authorization": "Bearer ${input:mlops-mcp-token}" }
    }
  }
}
```

**GitHub.com Copilot cloud agent** (repo Settings → Copilot → MCP servers). `COPILOT_MCP_MLOPS_TOKEN` adında bir Copilot environment secret tanımlayın:

```json
{
  "mcpServers": {
    "mlops-readmes": {
      "type": "http",
      "url": "https://ROUTE/mcp",
      "headers": { "Authorization": "Bearer $COPILOT_MCP_MLOPS_TOKEN" },
      "tools": ["list_repositories", "get_repository_readmes", "refresh_repository_readmes"]
    }
  }
}
```

Cloud agent GitHub altyapısında çalışır; route'a `ip_whitelist` koyarsanız GitHub Actions IP'lerine erişim kapanır.

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` (image'da `http`) | `stdio` veya `http` |
| `MCP_AUTH_TOKEN` | — | Ayarlıysa `/mcp` için `Authorization: Bearer` zorunlu |
| `GITHUB_TOKEN` | — | Private repo / yüksek rate limit |
| `MCP_REPOS_CONFIG` / `MCP_REPOS_CONFIG_URL` | `repos.yml` | Config dosyası veya HTTPS URL |
| `PORT`, `MCP_HOST`, `MCP_HTTP_PATH` | `8080`, `0.0.0.0`, `/mcp` | HTTP ayarları |
| `LOG_LEVEL` | `INFO` | Log seviyesi |
| `HTTPS_PROXY` / `NO_PROXY` | — | Kurumsal proxy (GitHub ve `--config-url` istekleri için) |

## Proxy

Cluster dışarıya proxy üzerinden çıkıyorsa `deployment.yaml` içindeki `env` listesine ekleyin. Server Python'un standart HTTP istemcisini kullandığı için bu değişkenler başka ayar gerektirmeden kullanılır:

```yaml
            - name: HTTPS_PROXY
              value: http://proxy.example.com:8080
            - name: NO_PROXY
              value: .cluster.local,.svc,localhost
```

## Sorun Giderme

- `CrashLoopBackOff`: `oc logs deploy/mlops-readmes-mcp` — genelde `repos.yml` parse hatası.
- `401`: Header `Authorization: Bearer <auth-token>` olmalı.
- `README not found or not accessible`: `repos.yml`'deki adres yanlış (hâlâ `your-org` olabilir) ya da `github-token` o repoyu okuyamıyor.
- GitHub isteklerinde timeout: Cluster dışarı çıkamıyordur; [proxy](#proxy) ayarını yapın.
- Build `pip`/`uv` adımında takılıyor: Build pod'u `pypi.org`'a erişemiyordur; image'ı CI'da build edin.
- GitHub erişilemezse server cache'teki eski README'yi döner (log'da `Serving stale README`); cache hiç yoksa hata döner.
- Cache pod başınadır ve pod yeniden başlayınca sıfırlanır; ilk istekte README'ler tekrar çekilir.
