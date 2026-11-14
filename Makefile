# Interface estável de comandos do projeto.
#
# Agentes, hooks e CI chamam SOMENTE estes alvos. Quando a stack mudar,
# muda o corpo dos alvos, nunca os nomes.
#
# Stack: Expo (React Native) + TypeScript, npm. Enquanto o app não for
# criado (sem package.json), cada alvo avisa e sai com sucesso, para não
# quebrar hooks e CI.

.PHONY: help setup dev format lint test test-db db-types test-e2e build check

FILE ?= .

# Prefixo das receitas: sai com sucesso se o app ainda não existe.
REQUIRE_APP = if [ ! -f package.json ]; then echo "[make $@] sem package.json: app Expo ainda não criado, nada a fazer"; exit 0; fi;

# Prefixo das receitas de banco: sai com sucesso se a CLI do Supabase não está instalada.
REQUIRE_SUPABASE = if ! command -v supabase >/dev/null 2>&1; then echo "[make $@] supabase CLI não encontrada: nada a fazer"; exit 0; fi;

help: ## Lista os comandos
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: ## Instala dependências
	@$(REQUIRE_APP) npm ci

dev: ## Sobe o ambiente local (Expo dev server)
	@$(REQUIRE_APP) npx expo start

format: ## Formata o código (FILE=caminho para um arquivo só)
	@$(REQUIRE_APP) npx prettier --write --ignore-unknown "$(FILE)"

lint: ## Lint + checagem de tipos + formatação
	@$(REQUIRE_APP) npx expo lint && npx tsc --noEmit && npx prettier --check .

test: ## Testes automatizados (unitários e de componentes) com cobertura
	@$(REQUIRE_APP) npx jest --ci --coverage

test-db: ## Testes de banco (pgTAP/RLS); precisa de Docker e `supabase start`
	@$(REQUIRE_SUPABASE) supabase test db

db-types: ## Gera src/lib/database.types.ts a partir do banco local
	@$(REQUIRE_SUPABASE) supabase gen types typescript --local > src/lib/database.types.ts && npx prettier --write src/lib/database.types.ts

test-e2e: ## Testes E2E com Maestro (precisa de emulador e app instalado)
	@$(REQUIRE_APP) maestro test .maestro/

build: ## Build de produção (bundle JS iOS + Android, sem credenciais de loja)
	@$(REQUIRE_APP) npx expo export --platform ios --platform android --output-dir dist

check: lint test build ## Tudo que a CI exige (lint + test + build)
