.PHONY: sync smoke smoke-http smoke-config-url

sync:
	uv sync

smoke:
	uv run python scripts/python_smoke.py

smoke-http:
	uv run python scripts/python_http_smoke.py

smoke-config-url:
	uv run python scripts/python_config_url_smoke.py
