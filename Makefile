.PHONY: install build test deploy clean local lint format

# Default stage
STAGE ?= dev

# Python/UV commands
UV := uv
PYTHON := $(UV) run python
PYTEST := $(UV) run pytest

# SAM commands
SAM := sam

install:
	$(UV) sync --all-extras

install-prod:
	$(UV) sync --no-dev

build:
	$(SAM) build

build-cached:
	$(SAM) build --cached --parallel

validate:
	$(SAM) validate --lint

test:
	$(PYTEST) tests/ -v

test-cov:
	$(PYTEST) tests/ -v --cov=src/layers/shared/python/complens --cov-report=html --cov-report=term

test-unit:
	$(PYTEST) tests/unit/ -v

test-integration:
	$(PYTEST) tests/integration/ -v

lint:
	$(UV) run ruff check src/ tests/
	$(UV) run mypy src/layers/shared/python/complens

format:
	$(UV) run ruff format src/ tests/
	$(UV) run ruff check --fix src/ tests/

# Local development
local:
	$(SAM) local start-api --env-vars env.json --warm-containers EAGER

local-invoke:
	$(SAM) local invoke $(FUNCTION) --env-vars env.json -e events/$(EVENT).json

# Deployment
deploy:
	$(SAM) deploy --config-env $(STAGE)

deploy-guided:
	$(SAM) deploy --guided --config-env $(STAGE)

# Specific stage deployments
deploy-dev:
	$(SAM) deploy --config-env dev

deploy-staging:
	$(SAM) deploy --config-env staging

deploy-prod:
	$(SAM) deploy --config-env prod

# Package for deployment
package:
	$(SAM) package --output-template-file packaged.yaml --s3-bucket $(BUCKET)

# Delete stack
delete:
	$(SAM) delete --stack-name complens-$(STAGE)

# Logs
logs:
	$(SAM) logs -n $(FUNCTION) --stack-name complens-$(STAGE) --tail

# Clean build artifacts
clean:
	rm -rf .aws-sam/
	rm -rf .pytest_cache/
	rm -rf htmlcov/
	rm -rf .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Seed development data
seed:
	$(PYTHON) scripts/seed_data.py --stage $(STAGE)

# Generate env.json for local development
env-json:
	@echo '{\n  "Parameters": {\n    "TABLE_NAME": "complens-$(STAGE)",\n    "STAGE": "$(STAGE)",\n    "SERVICE_NAME": "complens",\n    "COGNITO_USER_POOL_ID": "us-east-1_XXXXX",\n    "AI_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/123456789/complens-$(STAGE)-ai-queue"\n  }\n}' > env.json

# Help
help:
	@echo "Complens.ai - Marketing Automation Platform"
	@echo ""
	@echo "Usage: make [target] [STAGE=dev|staging|prod]"
	@echo ""
	@echo "Development:"
	@echo "  install        Install all dependencies including dev"
	@echo "  build          Build SAM application"
	@echo "  test           Run all tests"
	@echo "  test-cov       Run tests with coverage"
	@echo "  lint           Run linters (ruff, mypy)"
	@echo "  format         Format code with ruff"
	@echo "  local          Start local API Gateway"
	@echo "  clean          Remove build artifacts"
	@echo ""
	@echo "Deployment:"
	@echo "  deploy         Deploy to specified STAGE"
	@echo "  deploy-dev     Deploy to dev environment"
	@echo "  deploy-staging Deploy to staging environment"
	@echo "  deploy-prod    Deploy to production"
	@echo "  delete         Delete stack for STAGE"
	@echo ""
	@echo "Utilities:"
	@echo "  logs           Tail logs for FUNCTION"
	@echo "  seed           Seed development data"
	@echo "  env-json       Generate env.json for local dev"
