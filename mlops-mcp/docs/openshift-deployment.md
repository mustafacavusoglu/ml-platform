# OpenShift Deployment

MCP server normalde tek bir process olarak sürekli çalışabilir. OpenShift’te yayınlamak için server’ı `--transport http` ile başlatmak ve `/mcp` endpoint’ini HTTPS üzerinden dışarı açmak yeterli.

## Build ve Push

```bash
docker build -t mlops-readme-mcp:0.1.0 .
docker tag mlops-readme-mcp:0.1.0 image-registry.openshift-image-registry.svc:5000/CHANGE_NAMESPACE/mlops-readme-mcp:latest
docker push image-registry.openshift-image-registry.svc:5000/CHANGE_NAMESPACE/mlops-readme-mcp:latest
```

OpenShift internal registry kullanıyorsanız image stream kullanarak da build edebilirsiniz.

## ConfigMap ve Secret

```bash
oc create configmap mlops-readmes-config --from-file=repos.yml=openshift/repos.yml
oc create secret generic mlops-readmes-github-token --from-literal=token=CHANGE_ME
```

`GITHUB_TOKEN` opsiyonel. Public repo yeterliyse secret oluşturmaya gerek yok; deployment içinde `optional: true` tanımlı.

## Apply

```bash
oc apply -f openshift/deployment.yaml -f openshift/service.yaml -f openshift/route.yaml
```

Deployment `replicas: 1` olarak ayarlı çünkü mevcut HTTP modu stateful session kullanıyor. Replica artırmak isterseniz session affinity veya stateless transport stratejisi eklemek gerekir.

## Route’u Kontrol Et

```bash
oc get route mlops-readmes-mcp -o jsonpath='{"https://"}{.spec.host}{"\n"}'
```

Deployment, hazır olma kontrolü olarak `/healthz` yerine `tcpSocket` kullanır; Python MCP HTTP transport'u streamable-http olduğu için ayrı bir health route sunmaz.

## Copilot Bağlantısı

VS Code Copilot Chat için route host’unu kullanarak HTTP MCP server ekleyin:

```json
{
  "servers": {
    "mlops-readmes": {
      "type": "http",
      "url": "https://HOST/mcp"
    }
  }
}
```

GitHub.com repo MCP ayarları için `openshift/copilot-http.example.json` içindeki JSON kullanılabilir. Cloud agent remote MCP server’larda OAuth desteklemediği için route’u OAuth’sız HTTPS olarak bırakın.

## Yerel HTTP Testi

```bash
make smoke
make smoke-http
```
