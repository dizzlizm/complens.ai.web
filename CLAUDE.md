# CLAUDE.md - Complens.ai Project Guide

## Project Overview

Complens.ai is an AI-native marketing automation platform (GoHighLevel competitor) with a visual drag-and-drop workflow builder at its core. Think Tines/n8n meets Figma - everything visible on one canvas, connections are explicit lines between nodes, and AI can generate workflows from natural language.

## Tech Stack

| Layer | Technology |
|-------|------------|
| IaC | AWS SAM (Serverless Application Model) |
| Runtime | Python 3.12 with uv package manager |
| Database | DynamoDB (single-table design) |
| Compute | AWS Lambda |
| API | API Gateway REST + WebSocket API |
| Auth | Amazon Cognito |
| AI | Amazon Bedrock (Claude) |
| Workflow Engine | AWS Step Functions |
| Validation | Pydantic v2 |
| Testing | pytest with moto |

## Project Structure

```
complens/
├── template.yaml              # Main SAM template
├── samconfig.toml            # SAM config for dev/staging/prod
├── Makefile                  # Build, test, deploy commands
├── pyproject.toml            # uv/Python dependencies
├── .python-version           # 3.12
│
├── src/
│   ├── layers/
│   │   └── shared/           # Lambda layer
│   │       └── python/
│   │           └── complens/
│   │               ├── models/       # Pydantic models
│   │               ├── repositories/ # DynamoDB repositories
│   │               ├── services/     # Business logic
│   │               ├── nodes/        # Workflow node implementations
│   │               └── utils/        # Helpers
│   │
│   └── handlers/
│       ├── api/              # REST API handlers
│       ├── webhooks/         # External webhook handlers
│       ├── workers/          # Background workers
│       ├── websocket/        # WebSocket handlers
│       └── authorizer/       # JWT authorizer
│
├── step-functions/           # Step Functions definitions
├── tests/                    # pytest tests
└── scripts/                  # Utility scripts
```

## Key Files

- `template.yaml` - Main SAM template with all AWS resources
- `src/layers/shared/python/complens/models/` - Pydantic models
- `src/layers/shared/python/complens/nodes/` - Workflow node implementations
- `src/layers/shared/python/complens/services/workflow_engine.py` - Workflow execution engine

## Development Commands

```bash
# Install dependencies
make install

# Build SAM application
make build

# Run tests
make test
make test-cov  # With coverage

# Run locally
make local

# Lint and format
make lint
make format

# Deploy
make deploy STAGE=dev
make deploy-dev
make deploy-staging
make deploy-prod
```

## DynamoDB Single-Table Design

**Primary Table: `complens-{stage}`**
- PK: Partition Key (String)
- SK: Sort Key (String)
- GSI1PK, GSI1SK: Global Secondary Index 1
- GSI2PK, GSI2SK: Global Secondary Index 2

**Entity Key Patterns:**

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| Workspace | `AGENCY#{agency_id}` | `WS#{ws_id}` | `WS#{ws_id}` | `META` |
| Contact | `WS#{ws_id}` | `CONTACT#{contact_id}` | `WS#{ws_id}#EMAIL` | `{email}` |
| Conversation | `WS#{ws_id}` | `CONV#{conv_id}` | `CONTACT#{contact_id}` | `CONV#{created_at}` |
| Message | `CONV#{conv_id}` | `MSG#{timestamp}#{id}` | - | - |
| Workflow | `WS#{ws_id}` | `WF#{wf_id}` | `WS#{ws_id}#WF_STATUS` | `{status}#{wf_id}` |
| WorkflowRun | `WF#{wf_id}` | `RUN#{run_id}` | `CONTACT#{contact_id}` | `RUN#{created_at}` |
| WorkflowStep | `RUN#{run_id}` | `STEP#{sequence}#{id}` | - | - |

## Workflow Node Types

**Triggers (start the flow):**
- `trigger_form_submitted` - Form submission
- `trigger_appointment_booked` - Calendar booking
- `trigger_tag_added` - Contact tagged
- `trigger_sms_received` - Inbound SMS
- `trigger_email_received` - Inbound email
- `trigger_webhook` - External webhook
- `trigger_schedule` - Cron-based trigger

**Actions (do something):**
- `action_send_sms` - Send text message
- `action_send_email` - Send email
- `action_ai_respond` - AI generates and sends response
- `action_update_contact` - Update contact fields/tags
- `action_wait` - Delay for duration
- `action_webhook` - Call external API
- `action_create_task` - Create internal task

**Logic (control flow):**
- `logic_branch` - If/else based on conditions
- `logic_ab_split` - Random percentage split
- `logic_filter` - Continue only if conditions met
- `logic_goal` - End flow when condition achieved

**AI (intelligence):**
- `ai_decision` - AI chooses next path
- `ai_generate` - AI creates content
- `ai_analyze` - Sentiment, intent analysis
- `ai_conversation` - Multi-turn chat handler

## Environment Variables

Required in Lambda:
- `TABLE_NAME` - DynamoDB table name
- `STAGE` - dev/staging/prod
- `SERVICE_NAME` - "complens"
- `COGNITO_USER_POOL_ID` - Cognito user pool
- `AI_QUEUE_URL` - SQS queue for AI processing
- `WORKFLOW_QUEUE_URL` - SQS queue for workflow triggers

## API Endpoints

### Workspaces
- `GET /workspaces` - List workspaces
- `POST /workspaces` - Create workspace
- `GET /workspaces/{id}` - Get workspace
- `PUT /workspaces/{id}` - Update workspace
- `DELETE /workspaces/{id}` - Delete workspace

### Contacts
- `GET /workspaces/{ws_id}/contacts` - List contacts
- `POST /workspaces/{ws_id}/contacts` - Create contact
- `GET /workspaces/{ws_id}/contacts/{id}` - Get contact
- `PUT /workspaces/{ws_id}/contacts/{id}` - Update contact
- `DELETE /workspaces/{ws_id}/contacts/{id}` - Delete contact

### Workflows
- `GET /workspaces/{ws_id}/workflows` - List workflows
- `POST /workspaces/{ws_id}/workflows` - Create workflow
- `GET /workspaces/{ws_id}/workflows/{id}` - Get workflow
- `PUT /workspaces/{ws_id}/workflows/{id}` - Update workflow
- `DELETE /workspaces/{ws_id}/workflows/{id}` - Delete workflow
- `POST /workspaces/{ws_id}/workflows/{id}/execute` - Execute workflow
- `GET /workspaces/{ws_id}/workflows/{id}/runs` - List runs

### Conversations & Messages
- `GET /workspaces/{ws_id}/conversations` - List conversations
- `POST /workspaces/{ws_id}/contacts/{c_id}/conversations` - Create conversation
- `GET /conversations/{id}/messages` - List messages
- `POST /conversations/{id}/messages` - Send message

## Coding Standards

- Type hints everywhere
- Docstrings for public methods (Google style)
- Use `structlog` for structured logging
- No print statements
- Constants in SCREAMING_SNAKE_CASE
- Use Pydantic models, not raw dicts
- f-strings for string formatting

---

## Phase 1 Complete ✅

The core infrastructure is set up:
- SAM template with DynamoDB, Cognito, API Gateway, Lambda, SQS, Step Functions
- Pydantic models for all entities
- DynamoDB repository pattern
- Complete workflow node system (triggers, actions, logic, AI)
- Workflow execution engine with Step Functions integration
- REST API handlers for CRUD operations
- WebSocket handlers for real-time updates
- JWT authorizer for Cognito
- Test fixtures with moto

## Next Steps

### Phase 2: Integrations
- [ ] Twilio integration for SMS sending
- [ ] SES/SendGrid integration for email
- [ ] Complete webhook handlers

### Phase 3: AI Features
- [ ] Full Bedrock integration for AI nodes
- [ ] AI workflow generation from natural language
- [ ] Knowledge base integration

### Phase 4: Frontend
- [ ] React application with workflow canvas
- [ ] React Flow integration
- [ ] Real-time WebSocket updates

### Phase 5: Polish
- [ ] Stripe billing integration
- [ ] Workflow templates library
- [ ] Analytics dashboard
