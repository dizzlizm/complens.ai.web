.PHONY: install build test deploy clean local lint format web-install web-dev web-build web-deploy web-env deploy-full set-log-retention

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

build: build-layer
	$(SAM) build

# Build the shared layer with both pip packages and source code
build-layer:
	@echo "Building shared layer..."
	@rm -rf .layer-build
	@mkdir -p .layer-build/python
	@pip install -r src/layers/shared/requirements.txt -t .layer-build/python --quiet
	@cp -r src/layers/shared/python/complens .layer-build/python/
	@rm -rf src/layers/shared/python.bak 2>/dev/null || true
	@mv src/layers/shared/python src/layers/shared/python.bak 2>/dev/null || true
	@mv .layer-build/python src/layers/shared/python
	@rm -rf .layer-build
	@rm -rf src/layers/shared/python.bak
	@echo "Layer built successfully!"

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
	$(SAM) deploy --config-env $(STAGE) --resolve-s3

deploy-guided:
	$(SAM) deploy --guided --config-env $(STAGE)

# Specific stage deployments
deploy-dev:
	$(SAM) deploy --config-env dev --resolve-s3

deploy-staging:
	$(SAM) deploy --config-env staging --resolve-s3

deploy-prod:
	$(SAM) deploy --config-env prod --resolve-s3 --no-confirm-changeset

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

# ============================================
# Frontend Commands
# ============================================
web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

web-deploy: web-build
	@BUCKET=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text 2>/dev/null); \
	DIST_ID=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='FrontendDistributionId'].OutputValue" --output text 2>/dev/null); \
	if [ -z "$$BUCKET" ] || [ "$$BUCKET" = "None" ]; then \
		echo "Error: Frontend bucket not found. Make sure to deploy with EnableCustomDomain=true"; \
		exit 1; \
	fi; \
	echo "Deploying frontend to s3://$$BUCKET..."; \
	aws s3 sync web/dist/ s3://$$BUCKET/ --delete; \
	echo "Invalidating CloudFront cache..."; \
	aws cloudfront create-invalidation --distribution-id $$DIST_ID --paths "/*"; \
	echo "Frontend deployed successfully!"

web-env:
	@USER_POOL_ID=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text 2>/dev/null); \
	CLIENT_ID=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text 2>/dev/null); \
	API_URL=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='RestApiCustomUrl'].OutputValue" --output text 2>/dev/null); \
	if [ -z "$$API_URL" ] || [ "$$API_URL" = "None" ]; then \
		API_URL=$$(aws cloudformation describe-stacks --stack-name complens-$(STAGE) --query "Stacks[0].Outputs[?OutputKey=='RestApiUrl'].OutputValue" --output text 2>/dev/null); \
	fi; \
	echo "VITE_COGNITO_USER_POOL_ID=$$USER_POOL_ID" > web/.env.local; \
	echo "VITE_COGNITO_CLIENT_ID=$$CLIENT_ID" >> web/.env.local; \
	echo "VITE_API_URL=$$API_URL" >> web/.env.local; \
	echo "Created web/.env.local with:"; \
	cat web/.env.local

# Full deploy (backend + frontend)
deploy-full: deploy web-env web-deploy
	@echo "Full deployment complete!"

deploy-full-dev:
	$(MAKE) deploy-full STAGE=dev

# Set CloudWatch log retention on all Lambda log groups (default: 7 days for dev, 30 for prod)
LOG_RETENTION_DAYS ?= $(if $(filter prod,$(STAGE)),30,7)
set-log-retention:
	@echo "Setting $(LOG_RETENTION_DAYS)-day retention on all complens-$(STAGE) Lambda log groups..."
	@aws logs describe-log-groups \
		--log-group-name-prefix "/aws/lambda/complens-$(STAGE)-" \
		--query "logGroups[].logGroupName" --output text | \
	tr '\t' '\n' | while read -r lg; do \
		echo "  $$lg -> $(LOG_RETENTION_DAYS) days"; \
		aws logs put-retention-policy --log-group-name "$$lg" --retention-in-days $(LOG_RETENTION_DAYS); \
	done
	@echo "Done."

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
	@echo "Frontend:"
	@echo "  web-install    Install frontend dependencies"
	@echo "  web-dev        Start frontend dev server"
	@echo "  web-build      Build frontend for production"
	@echo "  web-deploy     Deploy frontend to S3/CloudFront"
	@echo "  web-env        Generate web/.env.local from deployed stack"
	@echo ""
	@echo "Deployment:"
	@echo "  deploy         Deploy backend to specified STAGE"
	@echo "  deploy-dev     Deploy backend to dev environment"
	@echo "  deploy-staging Deploy backend to staging environment"
	@echo "  deploy-prod    Deploy backend to production"
	@echo "  deploy-full    Deploy backend + frontend"
	@echo "  delete         Delete stack for STAGE"
	@echo ""
	@echo "Utilities:"
	@echo "  logs           Tail logs for FUNCTION"
	@echo "  seed           Seed development data"
	@echo "  env-json       Generate env.json for local dev"
	@echo "  set-log-retention  Set CloudWatch log retention (default 7 days)"
