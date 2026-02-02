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
| AI | Amazon Bedrock (Claude + Stability AI) |
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
| BusinessProfile | `WS#{ws_id}` | `PROFILE#AI` | - | - |

## Workflow Node Types

**Triggers (start the flow):**
- `trigger_form_submitted` - Form submission ✅
- `trigger_chat_started` - Visitor opens chat ✅ (EventBridge)
- `trigger_chat_message` - Visitor sends message ✅ (keyword filter support)
- `trigger_page_visit` - Visitor lands on page ✅ (UTM capture)
- `trigger_appointment_booked` - Calendar booking
- `trigger_tag_added` - Contact tagged ✅
- `trigger_sms_received` - Inbound SMS ✅ (needs Twilio credentials)
- `trigger_email_received` - Inbound email
- `trigger_webhook` - External webhook ✅
- `trigger_schedule` - Cron-based trigger
- `trigger_segment_event` - Segment track event ✅ (wildcard matching)

**Actions (do something):**
- `action_send_sms` - Send text message ✅ (Twilio integrated)
- `action_send_email` - Send email ✅ (SES integrated)
- `action_ai_respond` - AI generates and sends response ✅ (Bedrock + SMS/Email)
- `action_update_contact` - Update contact fields/tags ✅
- `action_wait` - Delay for duration ✅ (Step Functions)
- `action_webhook` - Call external API ✅
- `action_create_task` - Create internal task

**Logic (control flow):**
- `logic_branch` - If/else based on conditions ✅
- `logic_ab_split` - Random percentage split ✅
- `logic_filter` - Continue only if conditions met ✅
- `logic_goal` - End flow when condition achieved ✅

**AI (intelligence) - All use Bedrock:**
- `ai_decision` - AI chooses next path ✅
- `ai_generate` - AI creates content ✅
- `ai_analyze` - Sentiment, intent analysis ✅
- `ai_conversation` - Multi-turn chat handler ✅

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

### Pages
- `GET /workspaces/{ws_id}/pages` - List pages
- `POST /workspaces/{ws_id}/pages` - Create page
- `POST /workspaces/{ws_id}/pages/generate` - AI-generate page from source content
- `GET /workspaces/{ws_id}/pages/{id}` - Get page
- `PUT /workspaces/{ws_id}/pages/{id}` - Update page
- `DELETE /workspaces/{ws_id}/pages/{id}` - Delete page

### Forms
- `GET /workspaces/{ws_id}/forms` - List forms
- `POST /workspaces/{ws_id}/forms` - Create form
- `GET /workspaces/{ws_id}/forms/{id}` - Get form
- `PUT /workspaces/{ws_id}/forms/{id}` - Update form
- `DELETE /workspaces/{ws_id}/forms/{id}` - Delete form

### Public Endpoints (No Auth Required)
- `GET /public/pages/{slug}?ws={workspace_id}` - Get public page by slug
- `GET /public/subdomain/{subdomain}` - Get public page by subdomain
- `POST /public/pages/{page_id}/forms/{form_id}` - Submit form

### Subdomain Management
- `GET /workspaces/{ws_id}/pages/check-subdomain?subdomain={sub}` - Check availability

### AI Operations
- `GET /workspaces/{ws_id}/ai/profile` - Get business profile
- `PUT /workspaces/{ws_id}/ai/profile` - Update business profile
- `POST /workspaces/{ws_id}/ai/analyze-content` - Extract info from pasted content
- `GET /workspaces/{ws_id}/ai/onboarding/question` - Get next onboarding question
- `POST /workspaces/{ws_id}/ai/onboarding/answer` - Submit onboarding answer
- `POST /workspaces/{ws_id}/ai/improve-block` - Improve block content with AI
- `POST /workspaces/{ws_id}/ai/generate-blocks` - Generate page blocks from description
- `POST /workspaces/{ws_id}/ai/generate-image` - Generate image from prompt (Stability AI)
- `POST /workspaces/{ws_id}/ai/generate-workflow` - Generate workflow from natural language

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
- [x] Pydantic v2 ConfigDict migration (WorkflowNode done, base model updated)
- [ ] External ID lookup for Segment contacts uses scan (needs GSI for scale)
- [ ] No integration tests for handlers yet
- [ ] Step Functions state machine tests missing

### Recent Changes (Feb 2026)

**Auto-create workspace for new users:**
- Workspaces API (`src/handlers/api/workspaces.py`) now auto-creates a default workspace when a user calls GET /workspaces and has none
- Workspace is owned by the user (`agency_id = user_id`)
- Named "{email username}'s Workspace"

**Page-specific AI Profiles:**
- AI profiles are now per-page, not global
- `BusinessProfile` model has `page_id` field
- Profile stored with key `PAGE#{page_id}#PROFILE`
- `useBusinessProfile(workspaceId, pageId)` hook supports page-specific profiles
- AI Profile tab added to PageEditor

**Key files modified:**
- `src/layers/shared/python/complens/models/business_profile.py` - Added `page_id` field
- `src/layers/shared/python/complens/repositories/business_profile.py` - Fixed to use base class methods
- `src/handlers/api/ai.py` - Pass `page_id` to all functions
- `src/handlers/api/workspaces.py` - Auto-create workspace on list
- `web/src/lib/hooks/useAI.ts` - Page-specific profile support
- `web/src/pages/PageEditor.tsx` - Added AI Profile tab

### Current Issues (Investigating)

**Pages API returning 400:**
- GET /workspaces/{ws}/pages returning 400 Bad Request
- Lambda executes successfully (no errors in logs)
- Authorizer appears to work
- Possibly auth context not being passed correctly to handler
- Added logging to pages handler to debug

### Priority Order
1. **Phase 4.5: Client-Facing Pages** ✅ Complete
2. **Phase 3: AI Features** ✅ Workflow nodes complete (AI generation from NL pending)
3. **Lead Generation Triggers** ✅ Chat, page visit, form triggers with EventBridge
4. **Custom Domain for Pages** ← In Progress (user domains → landing pages)
5. Complete Twilio/Segment setup with working demo
6. Phase 5: Polish (billing, templates, analytics)

---

### Phase 4.5: Client-Facing Pages ✅ Complete

**Backend:**
- [x] Page model (`models/page.py`) with ChatConfig, status, slug, form_ids
- [x] Form model (`models/form.py`) with FormField, FormSubmission
- [x] Page repository (`repositories/page.py`) with slug/domain lookups
- [x] Form repository (`repositories/form.py`) with submission tracking
- [x] Admin API (`handlers/api/pages.py`, `handlers/api/forms.py`)
- [x] Public API (`handlers/api/public_pages.py`) - no auth required
- [x] EventBridge integration for form submission workflow triggers
- [x] SAM template updated with new Lambda functions

**AI Page Generation (Template + AI Hybrid):**
- [x] `POST /workspaces/{ws}/pages/generate` - AI generates page content
- [x] Takes ANY source content (resume, business description, product info, etc.)
- [x] Uses Bedrock Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`)
- [x] **Template-based approach**: AI generates text copy, templates provide beautiful HTML
- [x] Three premium templates: `professional`, `bold`, `minimal`
- [x] **Simplified 3-section design**: Hero (full-screen) → Features (3 cards) → CTA (conversion)
- [x] Modern CSS effects: gradients, blur, animations, responsive typography
- [x] Templates in `src/layers/shared/python/complens/services/page_templates.py`
- [x] Tailwind safelist in `web/tailwind.config.js` for dynamic HTML classes
- [x] Auto-creates lead capture form (email, name, message fields)
- [x] Configures AI chat persona based on page context
- [x] SEO meta title and description

**WebSocket Chat (Public AI Chat):**
- [x] `public_chat` action in WebSocket message handler
- [x] Bedrock Claude Sonnet integration for AI responses
- [x] Page lookup to get AI persona and business context
- [x] EventBridge events fired for `chat_message` (triggers workflows)
- [x] `$default` WebSocket route for unmatched actions

**Frontend:**
- [x] Public page renderer (`pages/public/PublicPage.tsx`)
- [x] AI chat widget (`components/public/ChatWidget.tsx`) with WebSocket real-time
- [x] Form component (`components/public/PublicForm.tsx`)
- [x] React Query hooks for public pages (`hooks/usePublicPage.ts`)
- [x] Admin pages list (`pages/Pages.tsx`)
- [x] Admin page editor (`pages/PageEditor.tsx`) with AI Generate button
- [x] React Query hooks for admin (`hooks/usePages.ts`, `hooks/useForms.ts`)
- [x] Sidebar navigation updated
- [x] Dynamic CSS color classes for primary color theming

**Public URL Pattern:**
- `/p/{page-slug}?ws={workspace-id}` - Public page with forms and AI chat

**Key Files:**
- `src/layers/shared/python/complens/models/page.py` - Page & ChatConfig models
- `src/layers/shared/python/complens/models/form.py` - Form & FormSubmission models
- `src/handlers/api/pages.py` - Admin + AI generate endpoint
- `src/handlers/api/public_pages.py` - Public endpoints (no auth)
- `web/src/pages/public/PublicPage.tsx` - Public page renderer with dynamic theming
- `web/src/components/public/ChatWidget.tsx` - WebSocket AI chat widget
- `web/src/pages/PageEditor.tsx` - Admin page builder with AI generation

---

### Phase 3: AI Features ✅ Complete

**Bedrock Integration (All workflow AI nodes implemented):**
- [x] `ai_decision` - AI chooses between multiple options based on context
- [x] `ai_generate` - AI creates content (text, JSON) with template support
- [x] `ai_analyze` - Sentiment, intent, and custom analysis
- [x] `ai_conversation` - Multi-turn chat with tool use support
- [x] `action_ai_respond` - Generates AI response and sends via SMS/email

**Model Configuration:**
- Default model: `anthropic.claude-3-sonnet-20240229-v1:0` (Claude 3 Sonnet)
- Fast model: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (Claude 4.5 Haiku - requires inference profile)
- Image generation: `amazon.titan-image-generator-v2:0` (Amazon Titan - 512 char prompt limit)
- Uses Bedrock inference profiles (`us.anthropic.*`) for newer Claude models

**Business Profile System (AI Context):**
The AI now has persistent context about each user's business, stored in DynamoDB and used across all AI operations.

- [x] `BusinessProfile` model with industry, business type, brand voice, products, team, testimonials
- [x] AI-driven onboarding flow with dynamic questions
- [x] Content analysis/extraction from pasted text (resumes, websites, docs)
- [x] Profile completeness score calculation
- [x] `get_ai_context()` method generates formatted context for AI prompts

**Per-Block AI Tools:**
Every content block in the page builder has AI improvement tools:

- [x] "AI" button with improvement options (better, shorter, expand, professional, casual, persuasive)
- [x] Quick improve (wand icon) for one-click enhancement
- [x] Regenerate (refresh icon) for fresh perspective
- [x] Image generation (for hero, image blocks) using Stability AI
- [x] Custom instruction input for specific changes

**AI Image Generation:**
- [x] Amazon Titan Image Generator v2 integration via Bedrock
- [x] Generate images from text prompts (512 character limit - auto-truncated)
- [x] Configurable size (1024x1024 default) and quality settings
- [x] Used in hero backgrounds and image blocks
- [x] Graceful fallback with helpful error when model not enabled

**AI Workflow Generation:**
- [x] Generate workflows from natural language descriptions
- [x] Analyzes description to identify triggers, actions, and logic
- [x] Creates proper node connections and configurations
- [x] Outputs React Flow compatible format

**Key Files:**
- `src/layers/shared/python/complens/models/business_profile.py` - Business profile model
- `src/layers/shared/python/complens/services/ai_service.py` - Central AI service
- `src/handlers/api/ai.py` - AI API endpoints
- `web/src/lib/hooks/useAI.ts` - React Query hooks for AI operations
- `web/src/pages/BusinessProfile.tsx` - Business profile UI with onboarding
- `web/src/components/page-builder/BlockAIToolbar.tsx` - Per-block AI tools

**API Endpoints (AI):**
```
GET  /workspaces/{ws}/ai/profile              - Get business profile
PUT  /workspaces/{ws}/ai/profile              - Update business profile
POST /workspaces/{ws}/ai/analyze-content      - Extract info from pasted content
GET  /workspaces/{ws}/ai/onboarding/question  - Get next onboarding question
POST /workspaces/{ws}/ai/onboarding/answer    - Submit onboarding answer
POST /workspaces/{ws}/ai/improve-block        - Improve block content
POST /workspaces/{ws}/ai/generate-blocks      - Generate page blocks from description
POST /workspaces/{ws}/ai/generate-image       - Generate image from prompt
POST /workspaces/{ws}/ai/generate-workflow    - Generate workflow from description
```

**Still TODO:**
- [ ] Knowledge base integration (Bedrock Knowledge Bases)
- [ ] AI-powered analytics and recommendations

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
- `web/src/lib/hooks/` - React Query hooks (useWorkflows, useContacts, useWorkspaces, usePages)
- `web/src/components/workflow/` - Workflow canvas and node components
- `web/src/components/workflow/NodeConfigPanel.tsx` - Node configuration sidebar
- `web/src/components/ui/DropdownMenu.tsx` - Portal-based dropdown (fixes z-index issues)
- `web/src/pages/WorkflowEditor.tsx` - Full workflow editor with save/load/test
- `web/src/pages/PageEditor.tsx` - Landing page editor with AI generation, domain/subdomain config

**Node Configuration Panel:**
- [x] Click any node to open config panel
- [x] Type-specific configuration fields for all node types:
  - Triggers: Form ID, Tag name, Webhook path, Cron schedule, Page ID, Chat keyword
  - Actions: Email (to/subject/body), SMS (message), Wait (duration), Webhook (URL/method/headers/body), Update Contact (tags/fields)
  - Logic: If/Else (field/operator/value), Filter, Goal
  - AI: Respond (prompt/channel), Decision (prompt/options), Generate (prompt/output variable)
- [x] Dynamic field types (text, textarea, number, select, checkbox, dynamic_select)
- [x] **Dynamic dropdowns from workspace data** - Forms, pages, workflows, tags, contact fields
- [x] Template variable hints ({{contact.field}})
- [x] Node label editing

**Workflow Testing:**
- [x] Test button executes workflow via API
- [x] Auto-saves before testing if unsaved changes
- [x] Success/error result notifications

**Recent Fixes (Jan-Feb 2026):**
- [x] DynamoDB float/Decimal conversion in `base.py` (DynamoDB requires Decimal, not float)
- [x] Pydantic v2 ConfigDict for WorkflowNode aliases (`type` ↔ `node_type`)
- [x] Frontend/backend type alignment (removed unused `trigger_type`/`trigger_config` from requests)
- [x] Proper node/edge validation error handling in workflow handlers
- [x] Response serialization with `by_alias=True` for React Flow compatibility
- [x] Enum/string status handling for workflows loaded from DynamoDB
- [x] **Dropdown menu z-index fix** - Created `DropdownMenu.tsx` using React Portal to render menus in `document.body`, escaping parent `overflow:hidden` containers
- [x] **Body content editor fix** - Reverted from ContentBlockEditor to simple textarea (ContentBlockEditor was corrupting HTML)
- [x] **Subdomain save button fix** - Changed disabled logic from `!available` (false when undefined) to `available === false` (only when explicitly unavailable)
- [x] **Page-centric architecture** - Forms and workflows now nested under pages (see below)
- [x] **GSI3 support in base repository** - Fixed query method to handle GSI3 for subdomain lookups
- [x] **Subdomain validation fix** - Allow empty string in UpdatePageRequest to clear subdomain
- [x] **Form loading for public pages** - Support both legacy (form_ids) and new (page_id) methods
- [x] **Unified AI page generator** - Header "AI Generate" button now uses same block generator as canvas
- [x] **CloudFront cache invalidation** - Pages invalidate CDN cache on update for immediate visibility
- [x] **Smart AI content extraction** - Resume/portfolio content detection with experience, skills, stats extraction
- [x] **BusinessProfile SK pattern fix** - Changed SK from `PAGE#{page_id}#PROFILE` to `PROFILE#PAGE#{page_id}` to avoid DynamoDB query conflicts with pages
- [x] **Enum/string handling in BusinessProfile** - Fixed `'str' object has no attribute 'value'` errors when loading from DynamoDB
- [x] **Image generation model update** - Migrated from deprecated SDXL 1.0 to Amazon Titan Image Generator v2
- [x] **Titan prompt length fix** - Added 512 character truncation for image prompts
- [x] **Visual block builder** - Complete drag-and-drop page builder with 12+ block types
- [x] **Client-side block rendering** - `PublicBlockRenderer.tsx` for React public page preview
- [x] **Server-side block rendering** - `render_blocks_html()` for subdomain/custom domain pages
- [x] **WebSocket chat permissions** - Added `execute-api:Invoke` action and additional ARN for PostToConnection
- [x] **WebSocket page lookup fix** - Removed `Limit=1` from DynamoDB scan in `_find_page_by_id()` which was causing "Page not found" errors
- [x] **Hero block image display fix** - Added `backgroundType: 'image'` when generating images for hero blocks
- [x] **Profile keystroke reload fix** - Added local state + onBlur handlers instead of mutating on every keystroke
- [x] **Profile 400 error fix** - Added `_sanitize_extracted_profile()` to fix AI extraction type mismatches + auto-reset for corrupted profiles
- [x] **Chat widget JavaScript escaping** - Added `_escape_js_string()` for safe chat_initial_message interpolation
- [x] **Chat widget error handling** - Added comprehensive console logging for debugging
- [x] **WebSocket custom domain fix** - Fixed endpoint URL for custom domains (don't include stage in path)
- [x] **ChatConfig Pydantic handling** - Fixed `'ChatConfig' object has no attribute 'get'` by handling Pydantic model properly

**Still TODO:**
- [ ] Real-time WebSocket updates for workflow runs
- [ ] Connect workflows to SES for email automation
- [ ] Complete Twilio SMS integration (pending business verification)

---

### Page-Centric Architecture ✅ Implemented

Restructured the app so Pages are the primary entity with Forms and Workflows nested inside.

**Data Model Changes:**
- Forms have optional `page_id` field (required for new forms, null for legacy)
- Workflows have optional `page_id` field (null = workspace-level)
- GSI1 updated for forms: `PAGE#{page_id}#FORMS` for page-scoped queries
- GSI2 updated for workflows: `PAGE#{page_id}#WORKFLOWS` for page-scoped queries

**API Endpoints (nested under pages):**
```
GET/POST   /workspaces/{ws}/pages/{page}/forms
GET/PUT/DELETE /workspaces/{ws}/pages/{page}/forms/{form}
GET/POST   /workspaces/{ws}/pages/{page}/workflows
GET/PUT/DELETE /workspaces/{ws}/pages/{page}/workflows/{workflow}
```

**Frontend Changes:**
- Forms tab added to PageEditor with inline FormBuilder component
- Workflows tab added to PageEditor for page-specific workflows
- Forms removed from sidebar navigation
- Workflows page shows only workspace-level workflows (with info banner)

**Key Files:**
- `models/form.py` - Added `page_id` field, updated GSI1 keys
- `models/workflow.py` - Added `page_id` field, added GSI2 keys method
- `repositories/form.py` - Added `list_by_page()` method
- `repositories/workflow.py` - Added `list_by_page()`, `list_workspace_level()` methods
- `handlers/api/pages.py` - Added nested form/workflow endpoints
- `web/src/pages/PageEditor.tsx` - Added Forms and Workflows tabs
- `web/src/components/FormBuilder.tsx` - New inline form builder component
- `web/src/lib/hooks/useForms.ts` - Added page-scoped hooks
- `web/src/lib/hooks/useWorkflows.ts` - Added page-scoped hooks

---

### Custom Domain for Landing Pages ✅ Implemented

Allow users to point their own domains (e.g., `itsross.com`) to their landing pages.

**Architecture:**
```
User's domain (itsross.com)
    ↓ CNAME
pages.dev.complens.ai (CloudFront)
    ↓ CloudFront Function (viewer-request)
    - Extracts Host header
    - Rewrites URI to /{domain}
    ↓
API Gateway /public/domain/{domain}
    ↓ Lambda
    - Looks up page by domain (GSI2)
    - Renders full HTML page
    - Returns with proper Content-Type
```

**Infrastructure (template.yaml):**
- [x] `PagesDomainRouterFunction` - CloudFront Function to extract Host header
- [x] `PagesDistribution` - CloudFront distribution for custom domains
- [x] `PagesDnsRecord` - Route 53 A record for pages.{domain}
- [x] `GET /public/domain/{domain}` - API endpoint returning rendered HTML

**Backend (src/):**
- [x] `render_full_page()` in `page_templates.py` - Renders complete HTML with chat widget
- [x] `get_page_by_domain()` in `public_pages.py` - Looks up page by domain
- [x] GSI2 for domain lookup: `PK=PAGE_DOMAIN#{domain}` (already in Page model)

**Frontend (web/):**
- [x] Domain tab in PageEditor with custom domain input
- [x] DNS configuration instructions with copy-able values
- [x] Status indicator (Pending DNS/Configured)

**User Setup (DNS):**
```
1. In Complens.ai:
   - Go to Pages → Edit your page
   - Click "Domain" tab
   - Enter your custom domain (e.g., yourdomain.com)
   - Save

2. At your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):
   - Go to DNS settings for your domain
   - Add CNAME record:
     Type: CNAME
     Name: @ (or www)
     Value: pages.dev.complens.ai
     TTL: 3600

3. Wait 5-30 minutes for DNS propagation
   - Your page is now live at https://yourdomain.com
```

**Technical Notes:**
- CloudFront Function extracts Host header and rewrites URI to include domain
- Lambda renders full HTML with embedded chat widget and form handling
- CDN caching disabled for dynamic content (CachingDisabled policy)
- For true custom domains (not subdomains), SSL cert must be added manually to CloudFront

**For Adding Custom Domains to Production:**
```bash
# 1. Request ACM certificate in us-east-1
aws acm request-certificate \
  --domain-name customerdomain.com \
  --validation-method DNS \
  --region us-east-1

# 2. Add DNS validation record (customer does this)
# 3. Add domain as CloudFront alias
aws cloudfront update-distribution \
  --id <PAGES_DISTRIBUTION_ID> \
  --distribution-config <config-with-new-alias>
```

**Outputs (when CustomDomainEnabled):**
- `PagesCnameTarget` - CNAME target for custom domains (pages.dev.complens.ai)
- `PagesDistributionId` - CloudFront distribution ID for custom domains
- `PagesDistributionDomainName` - CloudFront domain name

---

### Free Subdomain for Landing Pages ✅ Implemented

Allow users to claim a subdomain like `itsross.dev.complens.ai` instead of using long slug URLs.

**How it Works:**
```
User claims "itsross" subdomain
    ↓
Stored in DynamoDB with GSI3 for global lookup
    ↓
Visitor hits https://itsross.dev.complens.ai
    ↓
CloudFront Function extracts "itsross" from Host header
    ↓
Rewrites request to /public/subdomain/itsross
    ↓
Lambda looks up page by subdomain (GSI3)
    ↓
Returns rendered HTML page
```

**Backend:**
- [x] Page model updated with `subdomain` field (3-63 chars, alphanumeric + hyphens)
- [x] `RESERVED_SUBDOMAINS` set prevents claiming system subdomains (api, ws, www, app, admin, etc.)
- [x] GSI3 for global subdomain lookup: `GSI3PK=PAGE_SUBDOMAIN#{subdomain}`
- [x] `get_by_subdomain()` and `subdomain_exists()` in page repository
- [x] `/pages/check-subdomain` endpoint for real-time availability checking
- [x] `/public/subdomain/{subdomain}` endpoint for rendering pages by subdomain

**Infrastructure (template.yaml):**
- [x] GSI3 added to DynamoDB table (GSI3PK, GSI3SK)
- [x] `SubdomainRouterFunction` - CloudFront Function to extract subdomain from Host
- [x] `SubdomainDistribution` - CloudFront distribution with wildcard `*.${DomainName}`
- [x] Wildcard DNS records (A + AAAA) for `*.dev.complens.ai`
- [x] Wildcard SSL certificate via ACM

**Frontend:**
- [x] Subdomain input in PageEditor Domain tab
- [x] Real-time availability checking with 500ms debounce
- [x] Dynamic suffix based on environment (`VITE_API_URL`)
- [x] Status indicators (checking, available, taken)
- [x] Hooks in `usePages.ts`: `checkSubdomainAvailability()`

**Reserved Subdomains:**
```python
RESERVED_SUBDOMAINS = {
    'api', 'ws', 'www', 'app', 'admin', 'dev', 'staging', 'prod',
    'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'static', 'assets',
    'auth', 'login', 'signup', 'register', 'account', 'billing',
    'support', 'help', 'docs', 'blog', 'status', 'dashboard',
    'test', 'demo', 'sandbox', 'preview', 'beta', 'alpha',
}
```

**URL Patterns:**
- Subdomain: `https://{subdomain}.dev.complens.ai` (e.g., `https://itsross.dev.complens.ai`)
- Slug fallback: `/p/{slug}?ws={workspace_id}` (still works)
- Custom domain: `https://yourdomain.com` (separate feature)

**Key Files:**
- `src/layers/shared/python/complens/models/page.py` - Subdomain field + validation
- `src/layers/shared/python/complens/repositories/page.py` - GSI3 lookup methods
- `src/handlers/api/pages.py` - Availability check endpoint
- `src/handlers/api/public_pages.py` - Subdomain rendering endpoint
- `web/src/pages/PageEditor.tsx` - Subdomain UI in Domain tab
- `web/src/lib/hooks/usePages.ts` - `checkSubdomainAvailability()` function

---

### Visual Block Page Builder ✅ Implemented

Replaced the technical tab-based page editor with a user-friendly drag-and-drop block builder.

**Features:**
- [x] Drag-and-drop blocks from toolbar to canvas
- [x] Click-to-add alternative for adding blocks
- [x] 4-column grid layout (blocks can span 1-4 columns for side-by-side layouts)
- [x] Reorder blocks by dragging
- [x] Block config panel on selection
- [x] AI page generation from description
- [x] 13 block types (hero, features, cta, form, testimonials, faq, pricing, text, image, video, stats, divider, chat)

**Block Types:**
| Block | Purpose | Width Default |
|-------|---------|---------------|
| hero | Full-screen header with headline, CTA, background | 4 (full) |
| features | 3-column feature cards with icons | 4 (full) |
| cta | Call-to-action section | 4 (full) |
| form | Embedded lead capture form (from workspace forms) | 2-4 |
| chat | AI chat widget (inline or floating style) | 2-4 |
| testimonials | Customer quote cards | 4 (full) |
| faq | Accordion Q&A | 4 (full) |
| pricing | Pricing tier comparison | 4 (full) |
| text | Rich text content | 2-4 |
| image | Single image with caption + AI generation | 2-4 |
| video | YouTube/Vimeo embed | 2-4 |
| stats | Number highlights | 4 (full) |
| divider | Visual separator | 4 (full) |

**AI Page Generation:**
- "Build with AI" button on empty canvas
- "AI Generate" button in header (unified with canvas generator)
- Detects page type from description (resume, SaaS, portfolio, coming soon, service, product)
- Extracts names, titles, years of experience, technologies from resumes
- Extracts product names, pricing tiers, features from descriptions
- Generates contextual headlines, subheadlines, FAQ, testimonials, stats
- Style options: Professional, Bold, Minimal, Playful
- Options to include form and/or chat blocks
- **Replaces existing blocks** when generating (clears old content)

**Data Model:**
```python
class PageBlock(PydanticBaseModel):
    id: str
    type: str  # hero, features, cta, form, chat, etc.
    config: dict  # Block-specific settings
    order: int  # Position in page
    width: int  # 1-4 columns (default: 4)
```

**Key Files:**
- `web/src/components/page-builder/PageBuilderCanvas.tsx` - Main drag-drop container with grid layout
- `web/src/components/page-builder/BlockToolbar.tsx` - Sidebar with draggable block types
- `web/src/components/page-builder/BlockWrapper.tsx` - Block container with controls
- `web/src/components/page-builder/BlockConfigPanel.tsx` - Right panel for block settings + width selector
- `web/src/components/page-builder/AIBlockGenerator.tsx` - AI generation modal
- `web/src/components/page-builder/blocks/*.tsx` - Individual block components
- `web/src/components/page-builder/types.ts` - TypeScript types and BLOCK_TYPES metadata
- `src/layers/shared/python/complens/models/page.py` - PageBlock with width field
- `src/layers/shared/python/complens/services/page_templates.py` - Block rendering for public pages

**Dependencies:**
- `@dnd-kit/core` - Drag and drop
- `@dnd-kit/sortable` - Sortable lists
- `@dnd-kit/utilities` - CSS transform utilities

---

### CDN Cache Invalidation ✅ Implemented

When pages are updated or published, CloudFront cache is automatically invalidated so visitors see the latest content immediately.

**How it Works:**
1. Page is saved via `PUT /workspaces/{ws}/pages/{page_id}`
2. Backend calls `invalidate_page_cache()` if subdomain or custom domain is set
3. Service looks up CloudFront distribution IDs from CloudFormation stack outputs
4. Creates invalidation for relevant paths on the appropriate distribution

**Key Files:**
- `src/layers/shared/python/complens/services/cdn_service.py` - CDN invalidation service
- `src/handlers/api/pages.py` - Calls invalidation after page update

**Permissions Required:**
- `cloudfront:CreateInvalidation` - Create cache invalidations
- `cloudformation:DescribeStacks` - Look up distribution IDs from stack outputs

**Note:** Cache invalidations are fire-and-forget. If invalidation fails, the page save still succeeds and the cache will expire naturally (5 minutes TTL).

---

### Phase 5: Polish
- [ ] Stripe billing integration
- [ ] Workflow templates library
- [ ] Analytics dashboard
