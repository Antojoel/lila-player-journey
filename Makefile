.DEFAULT_GOAL := help
PLAYER_DATA_DIR ?= $(HOME)/Downloads/player_data

.PHONY: help install data verify dev build preview lint format check docker-serve docker-data clean

help:
	@echo "make install       install web + pipeline dependencies"
	@echo "make data          run the pipeline (PLAYER_DATA_DIR=$(PLAYER_DATA_DIR))"
	@echo "make verify        render coordinate-check overlays to pipeline/_verify/"
	@echo "make dev           Vite dev server on :5173"
	@echo "make build         production build -> web/dist"
	@echo "make preview       serve the production build locally"
	@echo "make lint          eslint + ruff check"
	@echo "make format        prettier + ruff format (writes)"
	@echo "make check         lint + format-check + typecheck + build (what CI runs)"
	@echo "make docker-serve  build + run the site in Docker on :8080"
	@echo "make docker-data   regenerate data via the pipeline container"

install:
	cd web && npm install
	python3 -m venv .venv && ./.venv/bin/pip install -r pipeline/requirements-dev.txt

data:
	cd pipeline && PLAYER_DATA_DIR="$(PLAYER_DATA_DIR)" ../.venv/bin/python build.py

verify:
	cd pipeline && PLAYER_DATA_DIR="$(PLAYER_DATA_DIR)" ../.venv/bin/python verify_coords.py

dev:
	cd web && npm run dev

build:
	cd web && npm run build

preview:
	cd web && npm run preview

lint:
	cd web && npm run lint
	./.venv/bin/ruff check pipeline

format:
	cd web && npm run format
	./.venv/bin/ruff format pipeline

check:
	cd web && npm run lint && npm run format:check && npm run typecheck && npm run build
	./.venv/bin/ruff check pipeline && ./.venv/bin/ruff format --check pipeline

docker-serve:
	docker compose up --build web

docker-data:
	PLAYER_DATA_DIR="$(PLAYER_DATA_DIR)" docker compose run --rm pipeline

clean:
	rm -rf web/dist web/node_modules .venv pipeline/__pycache__
