IMAGE ?= mlops-readme-mcp:dev

.PHONY: sync test run run-http image deploy

sync:
	uv sync

test:
	uv run pytest -q

run:
	uv run mlops-readme-mcp --config repos.yml

run-http:
	uv run mlops-readme-mcp --transport http --host 127.0.0.1 --config repos.yml

image:
	docker build -t $(IMAGE) .

# Requires `oc login` and `oc project <namespace>`.
deploy:
	oc apply -k openshift/
	oc start-build mlops-readme-mcp --from-dir=. --follow
	oc rollout status deploy/mlops-readmes-mcp
