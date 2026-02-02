.PHONY: help build up down restart logs clean dev dev-logs prod prod-logs health ps

help: ## Mostra esta mensagem de ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Build da imagem Docker
	docker-compose build

up: prod ## Alias para prod

prod: ## Inicia o container em modo produção
	docker-compose up -d
	@echo "Backend PPDM iniciado em modo produção na porta 3000"
	@echo "Acesse: http://localhost:3000/ppdm-activities"

dev: ## Inicia o container em modo desenvolvimento
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Backend PPDM iniciado em modo desenvolvimento na porta 3000"
	@echo "Acesse: http://localhost:3000/ppdm-activities"

down: ## Para e remove os containers
	docker-compose down
	docker-compose -f docker-compose.dev.yml down

restart: ## Reinicia os containers
	docker-compose restart

logs: ## Mostra os logs em tempo real (produção)
	docker-compose logs -f

dev-logs: ## Mostra os logs em tempo real (desenvolvimento)
	docker-compose -f docker-compose.dev.yml logs -f

prod-logs: logs ## Alias para logs

health: ## Verifica o health check do container
	@curl -s http://localhost:3000/health | jq
	@echo ""
	@docker inspect --format='{{json .State.Health}}' ppdm-backend 2>/dev/null | jq || echo "Container não está rodando"

ps: ## Lista os containers em execução
	docker-compose ps

clean: down ## Para containers e remove volumes
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v

rebuild: ## Rebuild completo (sem cache)
	docker-compose build --no-cache
	docker-compose up -d

shell: ## Acessa o shell do container
	docker-compose exec ppdm-backend sh

stats: ## Mostra estatísticas de uso dos containers
	docker stats

install: ## Instala dependências localmente
	npm install

start: ## Inicia a aplicação localmente
	npm start

start-dev: ## Inicia a aplicação localmente em modo desenvolvimento
	npm run dev
