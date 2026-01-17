# Complens.ai v3 - Consumer Privacy Scanner

A mobile-first PWA that helps consumers see and manage what third-party apps have access to their digital accounts.

## Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + TailwindCSS (PWA) |
| Auth | AWS Cognito |
| API | API Gateway HTTP API + Lambda |
| Database | DynamoDB (single-table design) |
| AI | Amazon Bedrock (Claude) |

**No VPC, no NAT Gateway, no RDS** = Low cost (~$5-10/month)

## Quick Start

### 1. Deploy Backend

```bash
cd v3
sam build
sam deploy --guided  # First time
sam deploy           # After first time
```

Save the outputs - you'll need them for the frontend.

### 2. Configure Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env with values from SAM deploy output
```

### 3. Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 4. Deploy Frontend

```bash
npm run build
# Upload dist/ to S3 + CloudFront
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Get user profile |
| PUT | /me | Yes | Update profile |
| GET | /accounts | Yes | List connected accounts |
| POST | /accounts | Yes | Connect new account |
| DELETE | /accounts/{id} | Yes | Remove account |
| GET | /apps | Yes | List discovered apps |
| POST | /scan | Yes | Start account scan |
| GET | /scan/{id} | Yes | Get scan status |
| POST | /chat | Yes | AI chat |

## DynamoDB Schema

Single-table design with composite keys:

| Entity | PK | SK |
|--------|----|----|
| User Profile | `USER#{userId}` | `PROFILE` |
| Account | `USER#{userId}` | `ACCOUNT#{accountId}` |
| App | `USER#{userId}` | `APP#{accountId}#{appId}` |
| Scan | `USER#{userId}` | `SCAN#{scanId}` |

## Roadmap

- [ ] OAuth flows for Google, Microsoft, GitHub
- [ ] Real app discovery (not mock data)
- [ ] Risk scoring algorithm
- [ ] Push notifications
- [ ] Social media integrations
- [ ] Web scraping for broader discovery
- [ ] Agentic AI for automated recommendations
