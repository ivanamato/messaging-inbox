.PHONY: install dev build preview lint typecheck clean mock docker docker-build docker-down docker-restart test test-e2e example-vue3

install: ## Install dependencies
	npm install

dev: ## Start dev server (reads VITE_API_URL, VITE_API_KEY, VITE_INSTANCE from .env)
	npm run dev

build: ## Build library (ES + UMD + CSS + .d.ts) → dist/
	npm run build

preview: ## Serve the built library locally for testing
	npm run preview

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type check
	npm run typecheck

clean: ## Remove build artifacts and node_modules
	rm -rf dist node_modules

example-vue3: build ## Build library and serve the Vue 3 CDN example at http://localhost:5174 (requires: make docker)
	npx serve . -l 5174 --no-request-logging -C


test: ## Run unit tests (Vitest)
	npm run test

test-e2e: ## Run e2e tests — requires: make docker
	npm run test:e2e

mock: ## Start app with mock server locally (no Docker, no real API needed)
	npm run mock-server:start & npm run dev

docker: ## Start full stack with Docker Compose
	docker compose up --build -d

docker-build: ## Rebuild Docker images from scratch
	docker compose build --no-cache

docker-down: ## Stop Docker Compose stack
	docker compose down

docker-restart: ## Restart Docker Compose stack with rebuild
	docker compose down && docker compose up --build -d

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
