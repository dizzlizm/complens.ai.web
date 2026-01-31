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

# Deploy (without custom domain)
make deploy STAGE=dev

# Deploy with custom domain
sam deploy --config-env dev --parameter-overrides \
  "Stage=dev EnableCustomDomain=true"
```

## Custom Domain Configuration

Custom domains are optional and controlled via parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EnableCustomDomain` | `false` | Enable/disable custom domain resources |
| `DomainName` | `dev.complens.ai` | Base domain (creates api.X and ws.X) |
| `HostedZoneId` | `Z02373573N3XBHSZBERY6` | Route 53 hosted zone ID |
| `CertificateArn` | `""` | Optional existing ACM cert ARN |

**Endpoints when enabled:**
- REST API: `https://api.dev.complens.ai`
- WebSocket: `wss://ws.dev.complens.ai`

**How it works:**
1. ACM certificate created with DNS validation via Route 53
2. API Gateway custom domains configured for REST and WebSocket
3. Route 53 A records point to the API Gateway endpoints

**Note:** If `CertificateArn` is provided, that cert is used instead of creating a new one.

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
- **Scaling architecture:** SQS FIFO queues with MessageGroupId for fair multi-tenant processing
- **EventBridge:** Event routing for triggers (tags, forms, inbound messages)
- **Custom domain:** Optional ACM + Route 53 configuration for api/ws subdomains

## Next Steps

### Phase 2: Integrations ✅

- [x] **Twilio integration for SMS sending**
  - `TwilioService` in `src/layers/shared/python/complens/services/twilio_service.py`
  - `SendSmsAction` node updated with real Twilio integration
  - Twilio inbound webhook handler with workspace lookup by phone (GSI2)
  - Signature validation support
- [x] **SES integration for email**
  - `EmailService` in `src/layers/shared/python/complens/services/email_service.py`
  - `SendEmailAction` node updated with real SES integration
  - Template email support via `send_templated_email()`
- [x] **Webhook handlers improved**
  - `_find_workspace_by_phone()` uses GSI2 lookup
  - Proper Twilio signature validation
- [x] **API testing script**: `scripts/test_api.py`
- [x] **Segment integration for customer data**
  - Webhook handler at `POST /webhooks/segment/{workspace_id}`
  - `identify` calls create/update contacts
  - `track` calls trigger workflows via `trigger_segment_event`
  - `group` calls associate contacts with companies
  - HMAC-SHA1 signature verification

**Integration Configuration (template.yaml parameters):**

| Parameter | Description |
|-----------|-------------|
| `TwilioAccountSid` | Twilio Account SID |
| `TwilioAuthToken` | Twilio Auth Token (NoEcho) |
| `TwilioPhoneNumber` | Default Twilio phone number |
| `SesFromEmail` | Default SES sender email |
| `SegmentSharedSecret` | Segment webhook shared secret (NoEcho) |

**Deploy with integrations:**
```bash
sam deploy --config-env dev --parameter-overrides \
  "Stage=dev \
   TwilioAccountSid=ACxxxxxxx \
   TwilioAuthToken=xxxxxxxx \
   TwilioPhoneNumber=+15551234567 \
   SesFromEmail=noreply@complens.ai \
   SegmentSharedSecret=your-segment-secret"
```

**Setting up Segment as a source:**

1. In Segment, go to **Connections > Destinations > Add Destination**
2. Search for "Webhooks" and select it
3. Configure the webhook URL:
   ```
   https://api.{your-domain}/webhooks/segment/{workspace_id}
   ```
4. Set the shared secret (same as `SegmentSharedSecret` parameter)
5. Enable the events you want to send (identify, track, etc.)

**Segment events supported:**
- `identify` → Creates/updates contacts with traits
- `track` → Triggers workflows matching the event name
- `page`/`screen` → Acknowledged (for analytics)
- `group` → Associates contact with company
- `alias` → Links user identities

---

## Notes & Blockers

### Twilio Verification (Blocked)
- **Issue**: Twilio requires business verification to get a trial phone number
- **Requirement**: Need a working website/product demo to show Twilio
- **Action**: Build frontend first, then return to complete Twilio setup
- **Status**: Code is ready (`TwilioService`, `action_send_sms`, inbound webhook) - just needs credentials

### Segment Setup (Pending Deployment)
- Code complete but requires:
  1. Deploy to AWS to get webhook URL
  2. Configure Segment destination with the URL
  3. Set `SegmentSharedSecret` parameter

### SES Email (Pending Verification)
- SES starts in sandbox mode (can only send to verified emails)
- Need to request production access after demo is ready
- Code is ready (`EmailService`, `action_send_email`)

### Technical Debt
- [ ] Pydantic deprecation warnings (json_encoders, class-based config)
- [ ] External ID lookup for Segment contacts uses scan (needs GSI for scale)
- [ ] No integration tests for handlers yet
- [ ] Step Functions state machine tests missing

### Priority Order
1. **Phase 4: Frontend** ← Current priority (unblocks Twilio verification)
2. **Phase 3: AI Features** (can run in parallel with frontend)
3. Complete Twilio/Segment setup after frontend deployed
4. Phase 5: Polish

---

### Phase 3: AI Features
- [ ] Full Bedrock integration for AI nodes
- [ ] AI workflow generation from natural language
- [ ] Knowledge base integration

### Phase 4: Frontend ✅ Core Features Complete

**Infrastructure:**
- [x] React + Vite + TypeScript scaffolding
- [x] Tailwind CSS with custom theme
- [x] AWS Amplify v6 Cognito integration
- [x] Auth pages (Login, Register, Forgot Password)
- [x] Protected routes with auth guards
- [x] App layout with responsive sidebar
- [x] S3 + CloudFront hosting infrastructure
- [x] Route 53 DNS for dev.complens.ai
- [x] Deploy script (`scripts/deploy.sh`)

**API Integration:**
- [x] Axios client with Cognito auth interceptor (`web/src/lib/api.ts`)
- [x] React Query hooks for data fetching (`web/src/lib/hooks/`)
- [x] CORS configured in API Gateway (wildcard origin)
- [x] Dashboard connected to API (real stats from workflows/contacts)
- [x] Workflows page connected to API (list, loading, error, empty states)
- [x] Contacts page connected to API (search, tag filter, loading states)

**Visual Workflow Builder:**
- [x] React Flow canvas with drag-and-drop (`web/src/components/workflow/WorkflowCanvas.tsx`)
- [x] Custom node components (Trigger, Action, Logic, AI)
- [x] Node toolbar with draggable node palette
- [x] Edge connections between nodes
- [x] Snap-to-grid and minimap
- [x] Delete nodes/edges (select + Delete/Backspace key)
- [x] Save workflow to backend API
- [x] Load existing workflow from API

**Frontend URLs:**
- Frontend: `https://dev.complens.ai`
- API: `https://api.dev.complens.ai`
- WebSocket: `wss://ws.dev.complens.ai`

**Deploy command:**
```bash
./scripts/deploy.sh dev
```

**Key Files:**
- `web/src/lib/api.ts` - Axios client with auth
- `web/src/lib/hooks/` - React Query hooks (useWorkflows, useContacts, useWorkspaces)
- `web/src/components/workflow/` - Workflow canvas and node components
- `web/src/components/workflow/NodeConfigPanel.tsx` - Node configuration sidebar
- `web/src/pages/WorkflowEditor.tsx` - Full workflow editor with save/load/test

**Node Configuration Panel:**
- [x] Click any node to open config panel
- [x] Type-specific configuration fields for all node types:
  - Triggers: Form ID, Tag name, Webhook path, Cron schedule
  - Actions: Email (to/subject/body), SMS (message), Wait (duration), Webhook (URL/method/headers/body), Update Contact (tags/fields)
  - Logic: If/Else (field/operator/value), Filter, Goal
  - AI: Respond (prompt/channel), Decision (prompt/options), Generate (prompt/output variable)
- [x] Dynamic field types (text, textarea, number, select, checkbox)
- [x] Template variable hints ({{contact.field}})
- [x] Node label editing

**Workflow Testing:**
- [x] Test button executes workflow via API
- [x] Auto-saves before testing if unsaved changes
- [x] Success/error result notifications

**Still TODO:**
- [ ] Real-time WebSocket updates

### Phase 5: Polish
- [ ] Stripe billing integration
- [ ] Workflow templates library
- [ ] Analytics dashboard
