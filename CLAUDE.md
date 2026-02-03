# CLAUDE.md - Complens.ai Project Guide

## Project Overview

Complens.ai is an AI-native marketing automation platform with a visual drag-and-drop workflow builder at its core. Think Tines/n8n meets Figma - everything visible on one canvas, connections are explicit lines between nodes, and AI can generate workflows from natural language.

## Tech Stack

| Layer | Technology |
|-------|------------|
| IaC | AWS SAM (Serverless Application Model) |
| Runtime | Python 3.12 with uv package manager |
| Database | DynamoDB (single-table design) |
| Compute | AWS Lambda |
| API | API Gateway REST + WebSocket API |
| Auth | Amazon Cognito |
| AI | Amazon Bedrock (Claude + Titan Image) |
| Workflow Engine | AWS Step Functions |
| Validation | Pydantic v2 |
| Testing | pytest with moto |
| Frontend | React + Vite + TypeScript + Tailwind |

## Project Structure

```
complens/
├── template.yaml              # Main SAM template
├── samconfig.toml            # SAM config for dev/staging/prod
├── Makefile                  # Build, test, deploy commands
├── pyproject.toml            # uv/Python dependencies
│
├── src/
│   ├── layers/shared/python/complens/
│   │   ├── models/           # Pydantic models
│   │   ├── repositories/     # DynamoDB repositories
│   │   ├── services/         # Business logic (ai_service, cdn_service, etc.)
│   │   ├── nodes/            # Workflow node implementations
│   │   └── utils/            # Helpers
│   │
│   └── handlers/
│       ├── api/              # REST API handlers
│       ├── webhooks/         # External webhook handlers (Twilio, Segment)
│       ├── workers/          # Background workers (workflow_executor)
│       ├── websocket/        # WebSocket handlers
│       └── authorizer/       # JWT authorizer
│
├── web/                      # React frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── pages/            # Page components
│   │   └── lib/hooks/        # React Query hooks
│   └── ...
│
├── step-functions/           # Step Functions definitions
└── tests/                    # pytest tests
```

## Development Commands

```bash
# Install dependencies
make install

# Build SAM application
make build

# Run tests
make test

# Deploy
make deploy STAGE=dev

# Deploy with custom domain
sam deploy --config-env dev --parameter-overrides "Stage=dev EnableCustomDomain=true"

# Deploy frontend
./scripts/deploy.sh dev
```

## URLs

| Environment | Frontend | API | WebSocket |
|-------------|----------|-----|-----------|
| Dev | `https://dev.complens.ai` | `https://api.dev.complens.ai` | `wss://ws.dev.complens.ai` |
| Prod | `https://complens.ai` | `https://api.complens.ai` | `wss://ws.complens.ai` |

---

## DynamoDB Single-Table Design

**Primary Table: `complens-{stage}`**

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| Workspace | `AGENCY#{agency_id}` | `WS#{ws_id}` | `WS#{ws_id}` | `META` |
| Contact | `WS#{ws_id}` | `CONTACT#{id}` | `WS#{ws_id}#EMAIL` | `{email}` |
| Conversation | `WS#{ws_id}` | `CONV#{id}` | `CONTACT#{contact_id}` | `CONV#{created_at}` |
| Message | `CONV#{conv_id}` | `MSG#{ts}#{id}` | - | - |
| Page | `WS#{ws_id}` | `PAGE#{id}` | `WS#{ws_id}#PAGES` | `{slug}` |
| Form | `WS#{ws_id}` | `FORM#{id}` | `PAGE#{page_id}#FORMS` | `{name}` |
| Workflow | `WS#{ws_id}` | `WF#{id}` | `WS#{ws_id}#WF_STATUS` | `{status}#{id}` |
| BusinessProfile | `WS#{ws_id}` | `PROFILE#PAGE#{page_id}` | - | - |

**GSI3** (subdomain lookup): `GSI3PK=PAGE_SUBDOMAIN#{subdomain}`

---

## API Endpoints

### Workspaces
```
GET/POST   /workspaces
GET/PUT/DELETE /workspaces/{id}
```

### Contacts
```
GET/POST   /workspaces/{ws}/contacts
GET/PUT/DELETE /workspaces/{ws}/contacts/{id}
```

### Pages
```
GET/POST   /workspaces/{ws}/pages
POST       /workspaces/{ws}/pages/generate        # AI generate from content
POST       /workspaces/{ws}/pages/create-complete # Create page + form + workflow
GET        /workspaces/{ws}/pages/check-subdomain?subdomain=xxx
GET/PUT/DELETE /workspaces/{ws}/pages/{id}

# Nested forms
GET/POST   /workspaces/{ws}/pages/{page}/forms
GET/PUT/DELETE /workspaces/{ws}/pages/{page}/forms/{form}

# Nested workflows
GET/POST   /workspaces/{ws}/pages/{page}/workflows
GET/PUT/DELETE /workspaces/{ws}/pages/{page}/workflows/{workflow}
```

### Workflows
```
GET/POST   /workspaces/{ws}/workflows
GET/PUT/DELETE /workspaces/{ws}/workflows/{id}
POST       /workspaces/{ws}/workflows/{id}/execute
GET        /workspaces/{ws}/workflows/{id}/runs
```

### AI Operations
```
GET/PUT    /workspaces/{ws}/ai/profile                    # Business profile
POST       /workspaces/{ws}/ai/profile/analyze            # Extract from content
GET        /workspaces/{ws}/ai/onboarding/question
POST       /workspaces/{ws}/ai/onboarding/answer
POST       /workspaces/{ws}/ai/improve-block              # Improve block content
POST       /workspaces/{ws}/ai/generate-blocks            # Generate page blocks
POST       /workspaces/{ws}/ai/generate-page-content      # Generate rich content for wizard
POST       /workspaces/{ws}/ai/refine-page-content        # Refine content with feedback
POST       /workspaces/{ws}/ai/generate-image             # Generate image (Titan)
POST       /workspaces/{ws}/ai/generate-workflow          # Generate workflow from NL
```

### Public (No Auth)
```
GET  /public/pages/{slug}?ws={workspace_id}
GET  /public/subdomain/{subdomain}
GET  /public/domain/{domain}
POST /public/pages/{page_id}/forms/{form_id}
```

---

## Workflow Node Types

**Triggers:**
- `trigger_form_submitted` - Form submission
- `trigger_chat_message` - Chat message (keyword filter)
- `trigger_tag_added` - Contact tagged
- `trigger_webhook` - External webhook
- `trigger_schedule` - Cron-based
- `trigger_segment_event` - Segment track event

**Actions:**
- `action_send_email` - Send email (SES)
- `action_send_sms` - Send SMS (Twilio)
- `action_ai_respond` - AI generates and sends response
- `action_update_contact` - Update contact fields/tags
- `action_wait` - Delay (Step Functions)
- `action_webhook` - Call external API

**Logic:**
- `logic_branch` - If/else conditions
- `logic_ab_split` - Random split
- `logic_filter` - Continue if conditions met

**AI Nodes:**
- `ai_decision` - AI chooses next path
- `ai_generate` - AI creates content
- `ai_analyze` - Sentiment/intent analysis

**Template Variables:**
```
{{contact.email}}, {{contact.first_name}}, {{contact.custom_fields.company}}
{{trigger_data.form_data.message}}
{{workspace.notification_email}}
```

---

## Page Builder

### Block Types
| Block | Purpose |
|-------|---------|
| hero | Full-screen header with headline, CTA, background |
| features | Feature cards with icons |
| cta | Call-to-action section |
| form | Embedded lead capture form |
| chat | AI chat widget |
| testimonials | Customer quotes |
| faq | Accordion Q&A |
| pricing | Pricing tiers |
| text | Rich text content |
| image | Single image (supports AI generation) |
| video | YouTube/Vimeo embed |
| stats | Number highlights |
| divider | Visual separator |

### AI Page Builder Wizard
5-phase conversational wizard that creates complete marketing packages:

1. **Discovery** - User describes business (free text + quick options)
2. **Content** - AI generates headlines, features, FAQ; user can refine
3. **Design** - Style selection (Professional/Bold/Minimal/Playful) + colors
4. **Automation** - Configure email notifications (welcome email, owner notifications)
5. **Build/Review** - Creates page, form, workflow; generates hero image

**Key Files:**
- `web/src/components/page-builder/AgenticPageBuilder.tsx` - Wizard UI
- `src/handlers/api/ai.py` - `generate-page-content`, `refine-page-content` endpoints
- `src/handlers/api/pages.py` - `create-complete` endpoint
- `src/layers/shared/python/complens/services/ai_service.py` - AI generation functions

---

## Bedrock Models

| Use Case | Model ID |
|----------|----------|
| Default (Sonnet 4.5) | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Fast (Haiku) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Image Generation | `amazon.titan-image-generator-v2:0` (512 char prompt limit) |

---

## Coding Standards

- Type hints everywhere (Python)
- Docstrings for public methods (Google style)
- Use `structlog` for structured logging
- No print statements
- Constants in SCREAMING_SNAKE_CASE
- Use Pydantic models, not raw dicts
- f-strings for string formatting

---

## Key Integrations

### Twilio SMS
- `TwilioService` in `services/twilio_service.py`
- Inbound webhook at `POST /webhooks/twilio/{workspace_id}`
- Requires: `TwilioAccountSid`, `TwilioAuthToken`, `TwilioPhoneNumber`

### SES Email
- `EmailService` in `services/email_service.py`
- Requires: `SesFromEmail` parameter

### Segment
- Webhook at `POST /webhooks/segment/{workspace_id}`
- Events: identify (→ contacts), track (→ workflows), group
- Requires: `SegmentSharedSecret` parameter

---

## Landing Page Hosting

### Subdomain (Free)
- User claims: `yourname.dev.complens.ai`
- GSI3 lookup: `PAGE_SUBDOMAIN#{subdomain}`
- Reserved: api, ws, www, app, admin, dev, staging, prod, etc.

### Custom Domain
- User points CNAME to `pages.dev.complens.ai`
- CloudFront Function extracts Host header
- Lambda renders full HTML with chat widget

---

## Environment Variables (Lambda)

```
TABLE_NAME          # DynamoDB table
STAGE               # dev/staging/prod
COGNITO_USER_POOL_ID
AI_QUEUE_URL        # SQS for AI processing
WORKFLOW_QUEUE_URL  # SQS for workflow triggers
ASSETS_BUCKET       # S3 for generated images
```

---

## Known Limitations

- Twilio SMS requires business verification (code ready, needs credentials)
- SES starts in sandbox mode (request production access when ready)
- Image generation requires Titan Image Generator v2 enabled in Bedrock

---

## Roadmap

- [ ] Stripe billing integration
- [ ] Workflow templates library
- [ ] Analytics dashboard
- [ ] Knowledge base integration (Bedrock Knowledge Bases)
