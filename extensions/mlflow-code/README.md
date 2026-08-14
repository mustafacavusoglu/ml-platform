# MLflow Runs for OpenShift AI

OpenShift AI workbench veya code-server üzerinde çalışan VS Code extension'ıdır. Aktif namespace/project adıyla eşleşen MLflow experiment'indeki run'ları listeler, seçilen run'ları yan yana karşılaştırır ve metrik değerlerini görselleştirir.

## Nasıl Çalışır?

Extension üç farklı bağlantı modunu destekler:

- `secret`: OpenShift pod içinden Kubernetes API ile `mlflow-secret` okuyarak MLflow kullanıcı adı, şifre ve tracking URI bilgisini alır.
- `basic`: Local geliştirme veya external MLflow sunucusu için kullanıcı adı ve şifre ile HTTP Basic Auth yapar.
- `oauth`: OpenShift `oauth-proxy` arkasındaki MLflow Route'una cookie tabanlı oturumla erişir.

Extension, MLflow experiment adını aktif namespace/project adından türetir. Yani `baklava-ai` namespace'inde `baklava-ai` adında bir experiment beklenir.

## Gereksinimler

- OpenShift AI workbench veya code-server
- MLflow Tracking HTTP API v2
- Namespace ile aynı adda MLflow experiment
- Secret modunda: pod service account token'ının mount edilmiş olması

## MLflow Kurulumu

Bu repoda hazır örnek manifest dosyaları bulunur:

```bash
oc apply -f cluster/mlflow.yaml
oc apply -f cluster/dummy-runs.yaml
```

`cluster/mlflow.yaml` şunları oluşturur:

- `mlflow-secret`
- MLflow Deployment
- MLflow Service
- MLflow Route

Varsayılan örnek bilgiler:

```text
username: mlflow
password: mlflow-password
service_uri: http://mlflow:5000
```

Gerçek kullanımda bu bilgileri değiştirin.

## MLflow Secret'ı

Secret'ı elle oluşturmak için:

```bash
oc create secret generic mlflow-secret \
  -n <namespace> \
  --from-literal=username=<mlflow-user> \
  --from-literal=password=<mlflow-password> \
  --from-literal=service_uri=<http://mlflow:5000>
```

Örnek:

```bash
oc create secret generic mlflow-secret \
  -n baklava-ai \
  --from-literal=username=mlflow \
  --from-literal=password=mlflow-password \
  --from-literal=service_uri=http://mlflow:5000
```

Service URI, extension'ın çalıştığı pod'dan erişilebilir olmalıdır. Aynı namespace içinde genellikle şu biçimler kullanılır:

```text
http://mlflow:5000
http://mlflow.<namespace>.svc.cluster.local:5000
```

### Secret adı ve key adları farklıysa

Varsayılan değerler:

```text
secret adı: mlflow-secret
username key: username
password key: password
service URI key: service_uri
```

Örneğin secret adı `mlflow-creds`, key adları da `MLFLOW_USER`, `MLFLOW_PASS`, `MLFLOW_URI` ise extension ayarları şöyle olmalıdır:

```json
{
  "mlflow.authMode": "secret",
  "mlflow.namespace": "baklava-ai",
  "mlflow.secretName": "mlflow-creds",
  "mlflow.secretUsernameKey": "MLFLOW_USER",
  "mlflow.secretPasswordKey": "MLFLOW_PASS",
  "mlflow.secretUriKey": "MLFLOW_URI"
}
```

Bu durumda Secret şu şekilde oluşturulabilir:

```bash
oc create secret generic mlflow-creds \
  -n baklava-ai \
  --from-literal=MLFLOW_USER=mlflow \
  --from-literal=MLFLOW_PASS=mlflow-password \
  --from-literal=MLFLOW_URI=http://mlflow:5000
```

`secretUsernameKey`, `secretPasswordKey` ve `secretUriKey` yalnızca secret modunda kullanılır. `basic` modda bunun yerine `mlflow.username` ve `mlflow.password` ayarları kullanılır.

## Extension Kurulumu

### VSIX Paketi Oluşturma

```bash
npm install
npm run package
```

Paket şu dosyada oluşur:

```text
mlflow-runs-openshift-ai-0.1.0.vsix
```

### code-server'a Kurulum

VSIX dosyasını workbench veya code-server ortamına kopyaladıktan sonra:

```bash
code-server --install-extension mlflow-runs-openshift-ai-0.1.0.vsix --force
```

Sonra code-server veya VS Code penceresini yeniden yükleyin:

```text
Developer: Reload Window
```

## Extension Ayarları

Ayarlar VS Code Settings UI'dan veya workspace `.vscode/settings.json` dosyasından yapılabilir.

### OpenShift Workbench / Secret Modu

OpenShift AI workbench içinde extension, service account token'ı kullanarak aynı namespace'deki secret'ı okuyabilir.

```json
{
  "mlflow.authMode": "secret",
  "mlflow.namespace": "baklava-ai",
  "mlflow.secretName": "mlflow-secret",
  "mlflow.secretUsernameKey": "username",
  "mlflow.secretPasswordKey": "password",
  "mlflow.secretUriKey": "service_uri",
  "mlflow.useDummyData": false
}
```

Namespace ayarlanmazsa extension şu ortam değişkenlerine bakar:

```text
KUBERNETES_NAMESPACE
POD_NAMESPACE
NAMESPACE
```

Kubernetes API URL'i ve service account token path'i de özelleştirilebilir:

```json
{
  "mlflow.kubernetesApiUrl": "",
  "mlflow.serviceAccountTokenPath": "/var/run/secrets/kubernetes.io/serviceaccount/token"
}
```

### Local Geliştirme / Basic Auth

Local VS Code veya code-server dışı bir ortamda MLflow Route'una Basic Auth ile bağlanmak için:

```json
{
  "mlflow.authMode": "basic",
  "mlflow.namespace": "baklava-ai",
  "mlflow.username": "mlflow",
  "mlflow.password": "mlflow-password",
  "mlflow.trackingUri": "http://mlflow-baklava-ai.apps-crc.testing"
}
```

### OAuth Proxy Modu

```json
{
  "mlflow.authMode": "oauth",
  "mlflow.trackingUri": "https://mlflow-route.example.com",
  "mlflow.cookieName": "openshift-session-token"
}
```

## Ortam Değişkenleri

Extension ayar yapılmamışsa şu ortam değişkenlerini de kullanır:

```text
MLFLOW_TRACKING_URI
KUBERNETES_NAMESPACE
POD_NAMESPACE
NAMESPACE
OPENSHIFT_APPS_DOMAIN
CLUSTER_DOMAIN
MLFLOW_SECRET_NAME
MLFLOW_USERNAME
MLFLOW_PASSWORD
MLFLOW_USE_DUMMY_DATA
```

## Komutlar

- `MLflow: Refresh Runs`: run listesini yeniler.
- `MLflow: Compare Runs`: karşılaştırma panelini açar.
- `MLflow: Sign in to OpenShift`: auth bilgilerini yükler veya test eder.
- `MLflow: Sign Out`: oturumu temizler.
- `MLflow: Open Tracking UI`: tracking URL'ini tarayıcıda açar.
- `MLflow: Toggle Dummy Data`: örnek veri modunu açar/kapatır.

## Dummy Data

Gerçek MLflow olmadan arayüzü test etmek için:

```json
{
  "mlflow.useDummyData": true
}
```

Veya `MLflow: Toggle Dummy Data` komutunu çalıştırın.

## Test ve Geliştirme

```bash
npm install
npm test
npm run compile
npm run package
```

## Sorun Giderme

### Secret token okunamıyor

```text
Could not read service account token from /var/run/secrets/kubernetes.io/serviceaccount/token
```

Bu hata genellikle extension'ın OpenShift pod'u içinde çalışmadığı anlamına gelir. Local geliştirmede `mlflow.authMode` değerini `basic` yapın veya `mlflow.useDummyData` açın.

### Run listesi boş

- `mlflow.namespace` değerinin MLflow experiment adıyla aynı olduğunu doğrulayın.
- MLflow Deployment ve Secret'ın aynı namespace'de olduğunu kontrol edin.
- `MLflow: Refresh Runs` komutunu çalıştırın.

### Auth hatası

- Secret anahtarlarının `username`, `password`, `service_uri` olduğunu doğrulayın.
- Basic modda `mlflow.username` ve `mlflow.password` ayarlarını kontrol edin.
