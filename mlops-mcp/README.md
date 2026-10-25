# MLOps README MCP

<!-- mcp-name: com.example/mlops-readmes -->

Şirket içindeki **MLOps platform repolarının** dokümantasyonunu **GitHub Copilot**'a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) üzerinden sunan, Python ile yazılmış küçük bir server.

Data scientist Copilot'a platformla ilgili bir soru sorduğunda, Copilot genel internet bilgisiyle tahmin yürütmez; **sizin template, chart ve image repolarınızın README'lerini** okuyup ona göre cevap verir:

> **"Batch model nasıl deploy edilir?"** → Copilot `template-batch` README'sini okur, cron schedule'dan deploy PR'ına kadar adımları anlatır.
>
> **"Build nasıl aldırırım?"** → `images-application` ve ilgili template README'sindeki build/pipeline adımlarını getirir.
>
> **"Yeni proje açmak ve GPU almak istiyorum"** → `chart-project-onboarding` README'sindeki talep sürecini anlatır.

- **Tek dosyadan yönetim:** Hangi repoların okunacağı ve her reponun neyi anlattığı `repos.yml` içinde tanımlanır.
- **Doğru repoyu Copilot seçer:** Repo açıklamalarına bakar, yalnızca soruyla ilgili README'leri okur.
- **Haftalık cache:** README'ler bir kez çekilir, 7 gün boyunca cache'ten sunulur. Böylece GitHub API limiti zorlanmaz.
- **Dayanıklı:** GitHub'a erişilemezse eski cache'teki README sunulmaya devam eder.
- **İki çalışma modu:** Lokal (`stdio`) ya da OpenShift'te merkezi servis (`http`, token korumalı, ölçeklenebilir).

---

## İçindekiler

- [Nasıl Çalışır?](#nasıl-çalışır)
- [Kaynaklar Nereden Geliyor?](#kaynaklar-nereden-geliyor)
- [Template Repo README'leri Nasıl Yazılmalı?](#template-repo-readmeleri-nasıl-yazılmalı)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Yapılandırma](#yapılandırma)
- [Tool'lar](#toollar)
- [OpenShift'e Kurulum](#openshifte-kurulum)
- [Copilot Bağlantısı](#copilot-bağlantısı)
- [Geliştirme](#geliştirme)
- [Proje Yapısı](#proje-yapısı)
- [Bilinen Sınırlar](#bilinen-sınırlar)

---

## Nasıl Çalışır?

```mermaid
flowchart LR
    A[Copilot Chat / Cloud Agent] -- MCP tool çağrısı --> B[MLOps README MCP]
    B -- 1. repo listesi --> C[(repos.yml<br/>dosya · URL · ConfigMap)]
    B -- 2. cache taze mi? --> D[(Cache<br/>JSON dosyası)]
    B -- 3. değilse çek --> E[GitHub REST API]
    E -- README --> B
    B -- README metni --> A
```

1. Copilot bir tool çağırır (örneğin `get_repository_readmes`).
2. Server istenen repoları `repos.yml` içinde bulur.
3. README cache'te varsa ve 7 günden yeniyse doğrudan cache'ten döner.
4. Cache yoksa ya da süresi dolmuşsa README GitHub API'den çekilir, cache'e yazılır ve döndürülür.

## Kaynaklar Nereden Geliyor?

Server'ın okuduğu her şey üç yerden gelir.

### 1. Repo listesi: `repos.yml`

Hangi repoların okunacağını bu dosya belirler. Server dosyayı açılışta **bir kez** okur. Dosyayı değiştirdikten sonra server'ı yeniden başlatmak gerekir. OpenShift'te bu işlem otomatik yapılır.

| Ortam | Dosya nereden okunur? |
|---|---|
| Lokal | `--config repos.yml` (varsayılan) |
| Şirket geneli | `--config-url https://.../repos.yml`: herkes merkezi tek bir dosyayı kullanır |
| OpenShift | `openshift/repos.yml` → ConfigMap → pod içinde `/app/config/repos.yml` |

`repos.yml` şirket platformunun repo yapısına göre hazırlanmış bir şablondur. `your-org` yerine kendi organization adınızı ve gerçek repo adlarını yazmanız gerekir:

| Grup | Repolar (`id`) | Cevapladığı sorular |
|---|---|---|
| Template'ler | `template-ml`, `template-batch`, `template-vllm`, `template-custom-serve` | Online/batch/LLM deploy, build, pipeline |
| Helm chart'ları | `chart-project-onboarding`, `chart-user-onboarding`, `chart-custom` | Proje açma, kullanıcı ekleme, quota, GPU, özel chart |
| Image'lar | `images-notebooks`, `images-application` | Workbench image'ları, paket ekleme, image build ve Nexus |
| Platform araçları | `ml-platform` | VS Code extension'ları, deployment PR akışı |

**`description` alanı en önemli alandır.** Copilot hangi README'yi okuyacağına bu açıklamalara bakarak karar verir. Açıklamaları kullanıcının soracağı kelimelerle yazın ("batch", "build", "GPU", "cron", "endpoint" gibi).

### 2. İçerik: GitHub REST API

README içeriği doğrudan GitHub'dan çekilir:

| `repos.yml` ayarı | Çağrılan endpoint |
|---|---|
| (varsayılan) | `GET https://api.github.com/repos/{owner}/{repo}/readme` (reponun ana README'si) |
| `readme_path: docs/README.md` | `GET https://api.github.com/repos/{owner}/{repo}/contents/docs/README.md` |
| `branch: dev` | Yukarıdaki çağrıya `?ref=dev` eklenir |

`GITHUB_TOKEN` tanımlıysa istekler token ile yapılır. Token olmadan yalnızca public repolar okunabilir ve limit saatte 60 istektir. Token ile private repolar da okunur ve limit saatte 5.000 isteğe çıkar.

### 3. Cache: JSON dosyası

Çekilen README'ler `cache.path` ile belirtilen dosyada saklanır:

- **Lokal:** `.cache/readmes.json`. Kalıcıdır, yeniden başlatmada silinmez.
- **OpenShift:** `/tmp/readmes.json`. Her pod'un kendi cache'i vardır ve pod yeniden başlayınca silinir. İlk istekte README'ler tekrar çekilir.

`refresh_repository_readmes` tool'u cache süresini beklemeden README'leri yeniden çeker.

## Template Repo README'leri Nasıl Yazılmalı?

MCP yalnızca README'de yazanı Copilot'a aktarır. Bu yüzden cevapların kalitesi README'lerin kalitesine bağlıdır. Her template ve chart reposunda şu başlıkların olması önerilir:

```markdown
# template-batch

Tek cümle: bu template ne işe yarar, ne zaman kullanılır (ne zaman kullanılmaz).

## Hızlı Başlangıç
Repoyu kopyalama / yeni proje oluşturma adımları.

## Model Nasıl Deploy Edilir?
Adım adım: hangi dosya değişir, hangi PR açılır, kim onaylar, nerede takip edilir.

## Build Nasıl Alınır?
Pipeline adı, nasıl tetiklenir, image nereye push edilir (Nexus yolu), tag kuralı.

## Yapılandırma
values.yaml / config alanları tablosu: alan, açıklama, varsayılan, örnek.

## Sık Karşılaşılan Hatalar
Hata mesajı → sebebi → çözümü.

## Destek
Takım kanalı, sorumlu ekip.
```

İpuçları:

- **Komutları ve dosya yollarını tam yazın.** Copilot bunları olduğu gibi kullanıcıya verir.
- **Başlıkları soru gibi yazın** ("Batch model nasıl deploy edilir?"). Copilot soruyla eşleştirmeyi kolay yapar.
- **README çok uzunsa** asıl anlatımı `docs/USAGE.md` gibi tek bir dosyaya koyup `repos.yml`'de `readme_path` ile o dosyayı gösterebilirsiniz. Aynı repoyu farklı `id`'lerle birden fazla dosya için de ekleyebilirsiniz (bkz. `examples/repos.demo.yml`).

## Hızlı Başlangıç

Gereksinim: **Python 3.11 veya üstü**. Kurulum için standart `pip` ya da `uv` kullanılabilir. uv, `uv.lock`'taki sabitlenmiş sürümleri kurar. pip ise `pyproject.toml`'daki sürüm aralığına uyan en güncel sürümleri kurar.

### Seçenek A: pip ile

```bash
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e .                     # geliştirme için: pip install -e . pytest

mlops-readme-mcp --config repos.yml  # stdio modunda başlat
```

Şirket içi PyPI mirror'ı (örneğin Nexus) kullanıyorsanız:

```bash
pip install -e . --index-url https://nexus.example.com/repository/pypi/simple
```

### Seçenek B: uv ile

```bash
uv sync                                       # .venv oluşturur, bağımlılıkları uv.lock'tan kurar
uv run mlops-readme-mcp --config repos.yml    # stdio modunda başlat
```

### Hemen denemek için

`repos.yml`'deki şirket adresleri doldurulana kadar herkese açık repolarla çalışan örneği kullanabilirsiniz:

```bash
mlops-readme-mcp --config examples/repos.demo.yml
```

### Token ve VS Code

Private repo veya daha yüksek API limiti için token verin:

```bash
GITHUB_TOKEN=ghp_xxx mlops-readme-mcp --config repos.yml
```

VS Code'da projeyi açtığınızda `.vscode/mcp.json` hazır gelir ve demo config'i (`examples/repos.demo.yml`) kullanır. Şirket repoları `repos.yml`'e girildikten sonra buradaki yolu `./repos.yml` yapın. Dosya `./.venv/bin/mlops-readme-mcp` yolunu kullandığı için sanal ortamın adı `.venv` olmalıdır (iki seçenek de bu adı kullanır). **MCP: List Servers** → `mlops-readmes` → **Start** adımlarından sonra Copilot Chat'i **Agent** moduna alın.

## Yapılandırma

### `repos.yml`

```yaml
cache:
  ttl_days: 7                 # README kaç gün cache'te kalsın
  path: .cache/readmes.json   # cache dosyası (göreli yollar config dosyasına göre çözülür)

repos:
  - id: mlflow                          # tool'larda kullanılan kısa ad (zorunlu)
    url: https://github.com/mlflow/mlflow   # yalnızca github.com (zorunlu)
    description: MLflow                 # opsiyonel
    branch: master                      # opsiyonel, varsayılan: reponun default branch'i
    readme_path: README.md              # opsiyonel, varsayılan: reponun ana README'si
```

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` (container'da `http`) | `stdio` veya `http` |
| `MCP_REPOS_CONFIG` | `repos.yml` | Config dosyasının yolu |
| `MCP_REPOS_CONFIG_URL` | — | Merkezi config URL'i (dosya yolunun önüne geçer) |
| `GITHUB_TOKEN` | — | Private repo erişimi ve yüksek API limiti |
| `MCP_AUTH_TOKEN` | — | HTTP modunda tanımlıysa `Authorization: Bearer <token>` zorunlu olur |
| `PORT` / `MCP_HOST` / `MCP_HTTP_PATH` | `8080` / `0.0.0.0` / `/mcp` | HTTP ayarları |
| `LOG_LEVEL` | `INFO` | Log seviyesi |

## Tool'lar

| Tool | Ne yapar? |
|---|---|
| `list_repositories` | Platform repolarını, neyi anlattıklarını (`description`) ve cache durumlarını listeler. Copilot doğru repoyu seçmek için önce bunu çağırır. |
| `get_repository_readmes` | Seçilen repoların dokümanını (README) döner. `repo_ids` verilmezse tüm repoların dokümanını döner. |
| `refresh_repository_readmes` | Cache'i beklemeden README'leri GitHub'dan yeniden çeker. |

Her repo ayrıca `readme://<repo-id>` adresinde MCP **resource** olarak da sunulur. Copilot cloud agent şimdilik yalnızca tool'ları destekler.

## OpenShift'e Kurulum

HTTP modunda server şöyle çalışır:

- **Stateless:** Session tutmaz, cevapları düz JSON olarak döner. Sticky session gerekmez ve birden fazla replica sorunsuz çalışır.
- **`/healthz`:** Liveness ve readiness probe'ları için health endpoint'i.
- **Token koruması:** `MCP_AUTH_TOKEN` tanımlıysa token'sız istekler `401` ile reddedilir.
- **OpenShift uyumlu image:** Rastgele UID ve read-only dosya sistemiyle çalışır.

```bash
oc project <namespace>
oc create secret generic mlops-readmes-mcp \
  --from-literal=auth-token="$(openssl rand -hex 32)" \
  --from-literal=github-token=ghp_xxx      # opsiyonel
make deploy
```

`make deploy` Kustomize paketini uygular (`oc apply -k openshift/`), image'ı cluster içinde build eder ve rollout'un bitmesini bekler. Repo listesini değiştirmek için `openshift/repos.yml`'i düzenleyip `oc apply -k openshift/` çalıştırmanız yeterli. Pod'lar otomatik yenilenir.

Ayrıntılar, Nexus/CI senaryosu ve sorun giderme: **[docs/openshift-deployment.md](docs/openshift-deployment.md)**

## Copilot Bağlantısı

**VS Code: OpenShift'teki server'a bağlanma** (`.vscode/mcp.json` ya da kullanıcı ayarları). Token bir kez sorulur ve VS Code'un secret storage'ında saklanır:

```json
{
  "inputs": [
    { "id": "mlops-mcp-token", "type": "promptString", "description": "MLOps MCP token", "password": true }
  ],
  "servers": {
    "mlops-readmes": {
      "type": "http",
      "url": "https://<route-host>/mcp",
      "headers": { "Authorization": "Bearer ${input:mlops-mcp-token}" }
    }
  }
}
```

**GitHub.com Copilot cloud agent**, **MCP registry** ve **kurumsal allowlist** kurulumları için: [docs/enterprise-deployment.md](docs/enterprise-deployment.md). Uçtan uca kurulum rehberi: [docs/KURULUM.md](docs/KURULUM.md).

## Geliştirme

| İş | pip (sanal ortam aktifken) | uv / make |
|---|---|---|
| Testleri çalıştır (ağ gerekmez) | `pytest -q` | `make test` |
| stdio modunda başlat | `mlops-readme-mcp --config repos.yml` | `make run` |
| http modunda başlat | `mlops-readme-mcp --transport http --host 127.0.0.1 --config repos.yml` | `make run-http` |
| Docker image'ı build et | `docker build -t mlops-readme-mcp:dev .` | `make image` |

HTTP modunda endpoint `http://127.0.0.1:8080/mcp` adresindedir.

Testler şunları kapsar: stdio açılışı, stateless HTTP üzerinden tool çağrıları, bearer token kontrolü, cache davranışı, GitHub kesintisinde eski cache'e düşme ve URL'den config yükleme.

## Proje Yapısı

```text
mlops-mcp/
├── src/mlops_readme_mcp/
│   ├── server.py      # MCP tool'ları, HTTP uygulaması, token kontrolü, CLI
│   ├── config.py      # repos.yml okuma (dosya veya URL)
│   ├── github.py      # GitHub REST API istemcisi
│   └── cache.py       # TTL'li JSON cache
├── tests/             # pytest testleri
├── openshift/         # Kustomize paketi (build, deployment, service, route, repos.yml)
├── docs/              # Kurulum ve dağıtım rehberleri
├── registry/          # MCP Registry metadata'sı
├── agents/            # GitHub Copilot custom agent tanımı
├── examples/          # Herkese açık repolarla çalışan demo config
├── repos.yml          # Şirket repo listesi (şablon)
└── Dockerfile
```

## Bilinen Sınırlar

- **Yalnızca github.com:** Platform repoları GitHub Enterprise Server'da ya da Azure DevOps'taysa okunamaz. Bu durumda `github.py`'a ilgili API desteğinin eklenmesi gerekir.
- **Yalnızca README:** `docs/` klasörü gibi diğer dokümanlar okunmuyor. Tek bir dosya `readme_path` ile seçilebilir.
- **Cache pod başına:** OpenShift'te her pod GitHub'a ayrı istek atar ve cache pod yeniden başlayınca silinir. Repo sayısı az olduğu sürece bu sorun yaratmaz.
- **Uzun cevaplar:** `get_repository_readmes` parametresiz çağrılırsa tüm README'ler tek cevapta döner ve uzun README'ler Copilot'un bağlamını doldurur. Copilot normalde önce `list_repositories` ile seçim yapar; README'leri odaklı tutmak yine de önemlidir.
