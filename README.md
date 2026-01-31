# Complens.ai

AI-Native Marketing Automation Platform - A GoHighLevel competitor with visual workflow builder.

## Tech Stack

- **Backend**: AWS SAM, Python 3.12, Lambda, API Gateway, Step Functions
- **Database**: DynamoDB (single-table design)
- **Auth**: Amazon Cognito
- **AI**: Amazon Bedrock (Claude)
- **Queue**: SQS FIFO for fair multi-tenant processing
- **Events**: EventBridge for workflow trigger routing

## Quick Start

```bash
# Install dependencies
make install

# Run tests
make test

# Deploy to dev
make deploy STAGE=dev

# Run locally with SAM
make local
```

## Project Structure

```
complens.ai/
├── src/
│   ├── handlers/           # Lambda function handlers
│   │   ├── api/            # REST API handlers
│   │   ├── workers/        # Background workers
│   │   ├── webhooks/       # Inbound webhooks
│   │   └── websocket/      # WebSocket handlers
│   └── layers/shared/      # Shared code layer
│       └── python/complens/
│           ├── models/     # Pydantic models
│           ├── repositories/  # DynamoDB repositories
│           ├── nodes/      # Workflow node implementations
│           └── services/   # Business logic services
├── step-functions/         # Step Functions state machines
├── tests/                  # Test suite
├── template.yaml           # SAM template
└── pyproject.toml          # Python project config
```

## Workflow Node Types

### Triggers
- Form submitted, Tag added, Appointment booked
- SMS/Email inbound, Webhook received, Manual trigger

### Actions
- Send SMS/Email, Wait, Update contact
- Create task, Internal notification

### Logic
- Branch (if/else), A/B split, Goal check, Go to

### AI
- AI decision, Intent classifier, Sentiment analyzer, Content generator

## Architecture

Events flow: DynamoDB Streams → EventBridge → SQS FIFO → Step Functions

The FIFO queue uses `MessageGroupId=workspace_id` for fair multi-tenant processing.
