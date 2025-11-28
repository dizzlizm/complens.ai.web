# AWS Bedrock Model Configuration

This document describes the available AWS Bedrock models for Complens.ai and how to switch between them.

## Current Setup (Dual-Model Architecture)

Complens.ai uses **two different models** for optimal cost and performance:

### 1. Chat Model (General Conversations)
**Amazon Nova Lite** (Default)
- Model ID: `us.amazon.nova-lite-v1:0`
- Best for: General chat, simple queries
- Strengths: Fast, very cost-effective
- Cost: **$0.06 per million input tokens**, **$0.24 per million output tokens**
- **50x cheaper than Claude!**

### 2. Security Analysis Model (Smart Tasks)
**Claude 3.5 Sonnet v2** (Default)
- Model ID: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
- Best for: Security analysis, complex reasoning
- Strengths: Excellent security logic, deep reasoning
- Cost: $3 per million input tokens, $15 per million output tokens
- Used for: Security scans, threat analysis, MCP operations

## Why Two Models?

| Task Type | Model Used | Reason |
|-----------|-----------|--------|
| User chat messages | Nova Lite | Fast, cheap, good enough |
| Security analysis | Claude 3.5 Sonnet | Needs deep reasoning |
| Google Workspace scan | Claude 3.5 Sonnet | Complex security logic |
| Simple queries | Nova Lite | Cost-effective |

**Cost Savings:**
- Chat with Nova: $0.0003 per 1000 tokens
- Chat with Claude: $0.015 per 1000 tokens
- **Savings: 98% on general chat!**

## Available Models

### Amazon Nova (Recommended for Chat)

#### 1. Amazon Nova Micro (Cheapest) 💰
```
Model ID: us.amazon.nova-micro-v1:0
```
**Best for ultra-low cost, high volume**
- Smallest, fastest Nova model
- Cost: **$0.035 input / $0.14 output** per million tokens
- **86x cheaper than Claude!**
- Good for: Simple chat, quick responses, high volume
- Trade-off: Less capable reasoning

#### 2. Amazon Nova Lite (Default for Chat) ✅
```
Model ID: us.amazon.nova-lite-v1:0
```
**Best balance for general chat**
- Fast and cost-effective
- Cost: **$0.06 input / $0.24 output** per million tokens
- **50x cheaper than Claude!**
- Good for: General conversation, simple queries
- Better reasoning than Micro

#### 3. Amazon Nova Pro
```
Model ID: us.amazon.nova-pro-v1:0
```
**Balanced performance**
- Better reasoning than Lite
- Cost: **$0.80 input / $3.20 output** per million tokens
- Still 4x cheaper than Claude
- Good for: More complex conversations

### Claude Models (Recommended for Security)

#### 1. Claude 3.5 Sonnet v2 (Default for Security) ✅
```
Model ID: us.anthropic.claude-3-5-sonnet-20241022-v2:0
```
**Best choice for security-focused applications**
- Strong reasoning capabilities
- Excellent at security analysis and threat detection
- Proven stability
- Good balance of cost and performance
- Fast response times

### 2. Claude 3 Opus (Most Powerful)
```
Model ID: anthropic.claude-3-opus-20240229-v1:0
```
**Use when you need maximum reasoning power**
- Best reasoning capabilities of all Claude models
- Exceptional for complex security logic
- Excellent at understanding nuanced security issues
- More expensive (~$15 input / $75 output per million tokens)
- Slower response times

### 3. Claude 3.5 Sonnet v1 (Proven Alternative)
```
Model ID: anthropic.claude-3-5-sonnet-20240620-v1:0
```
**Reliable fallback option**
- Proven track record
- Still excellent reasoning
- Similar cost to v2
- Good for security analysis

### 4. Claude 3 Haiku (Fastest/Cheapest)
```
Model ID: anthropic.claude-3-haiku-20240307-v1:0
```
**Use for simple queries or high volume**
- Very fast responses
- Lowest cost (~$0.25 input / $1.25 output per million tokens)
- Good for simple security checks
- Not recommended for complex security reasoning

## Other AWS Bedrock Models

### Meta Llama 3.1 405B
```
Model ID: meta.llama3-1-405b-instruct-v1:0
```
- Open source, large model
- Good general reasoning
- Not as strong for security-specific tasks
- Cheaper than Claude

### Mistral Large
```
Model ID: mistral.mistral-large-2407-v1:0
```
- Good reasoning capabilities
- European privacy compliance
- Decent for security analysis
- Mid-range pricing

## How to Switch Models

### Option 1: GitHub Secrets (Recommended) ⭐

Set GitHub repository secrets to configure models:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

```bash
# For chat model (general conversations)
Name: BEDROCK_MODEL_ID
Value: us.amazon.nova-micro-v1:0

# For security analysis model
Name: BEDROCK_SECURITY_MODEL_ID
Value: us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

**Available Models for Each:**

**BEDROCK_MODEL_ID** (Chat):
- `us.amazon.nova-micro-v1:0` (cheapest)
- `us.amazon.nova-lite-v1:0` (recommended)
- `us.amazon.nova-pro-v1:0` (more capable)
- `anthropic.claude-3-haiku-20240307-v1:0` (fast Claude)

**BEDROCK_SECURITY_MODEL_ID** (Security):
- `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (recommended)
- `anthropic.claude-3-opus-20240229-v1:0` (most powerful)

**Next deployment will use your selected models!**

### Option 2: CloudFormation Parameters

Edit parameter files directly:

**For dev:** `infrastructure/cloudformation/parameters/dev.json`
```json
{
  "ParameterKey": "BedrockModelId",
  "ParameterValue": "us.amazon.nova-micro-v1:0"
},
{
  "ParameterKey": "BedrockSecurityModelId",
  "ParameterValue": "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

Then deploy infrastructure.

### Option 3: AWS Console (After Deployed)

1. Go to AWS Lambda console
2. Find your function: `dev-complens-api`
3. Configuration → Environment variables
4. Edit `BEDROCK_MODEL_ID` and `BEDROCK_SECURITY_MODEL_ID`
5. Save (takes effect immediately)

## Model Selection Guide

| Use Case | Recommended Model | Why |
|----------|------------------|-----|
| **Security Analysis** | Claude 3.5 Sonnet v2 | Best balance for security logic |
| **Complex Threat Modeling** | Claude 3 Opus | Maximum reasoning power |
| **High Volume Queries** | Claude 3 Haiku | Fast and cheap |
| **Compliance Analysis** | Claude 3.5 Sonnet v2 | Strong at regulatory reasoning |
| **Code Security Review** | Claude 3.5 Sonnet v2 or Opus | Excellent at code analysis |
| **Quick Checks** | Claude 3 Haiku | Speed over depth |

## Cost Comparison (Per Million Tokens)

| Model | Input Cost | Output Cost | Total (1M in + 1M out) | vs Claude Savings |
|-------|-----------|-------------|------------------------|-------------------|
| **Amazon Nova Micro** 💰 | $0.035 | $0.14 | $0.175 | **99% cheaper!** |
| **Amazon Nova Lite** ✅ | $0.06 | $0.24 | $0.30 | **98% cheaper!** |
| Amazon Nova Pro | $0.80 | $3.20 | $4.00 | 78% cheaper |
| Claude 3 Haiku | $0.25 | $1.25 | $1.50 | 92% cheaper |
| Claude 3.5 Sonnet v1/v2 | $3.00 | $15.00 | $18.00 | baseline |
| Claude 3 Opus | $15.00 | $75.00 | $90.00 | 400% more expensive |
| Llama 3.1 405B | $2.65 | $3.50 | $6.15 | 66% cheaper |
| Mistral Large | $2.00 | $6.00 | $8.00 | 56% cheaper |

### Real-World Cost Estimate

**With Dual-Model Setup (Nova Lite + Claude 3.5 Sonnet):**

Assumptions:
- 1000 users/month
- 10 messages per user = 10,000 messages
- Average message: 200 input tokens, 800 output tokens

**Chat (Nova Lite):**
- Input: 10,000 × 200 = 2M tokens × $0.06 = $0.12
- Output: 10,000 × 800 = 8M tokens × $0.24 = $1.92
- **Chat Total: $2.04/month**

**Security Analysis (Claude 3.5 Sonnet, 100 scans/month):**
- Input: 100 × 500 = 50K tokens × $3.00 = $0.15
- Output: 100 × 2000 = 200K tokens × $15.00 = $3.00
- **Security Total: $3.15/month**

**Grand Total: ~$5-6/month for AI costs**

**If you used Claude for everything: ~$200/month** 😱

## Switching Back to Sonnet 4

If you need to use Sonnet 4 again:
```
Model ID: us.anthropic.claude-sonnet-4-20250514-v1:0
```

Note: Sonnet 4 is the latest but may have availability issues in some regions.

## Cross-Region Models

For better availability, you can use cross-region inference:
```
us.anthropic.claude-3-5-sonnet-20241022-v2:0  (US cross-region)
eu.anthropic.claude-3-5-sonnet-20241022-v2:0  (EU cross-region)
```

Cross-region models provide:
- Better availability
- Automatic failover
- Same pricing
- Slightly higher latency

## Troubleshooting

### "Model not found" error
- Verify the model ID is correct
- Check your AWS region supports the model
- Ensure Bedrock access is enabled in your account

### "Throttling" error
- Increase your Bedrock quota limits
- Switch to a cross-region model for higher throughput
- Implement request queuing

### High costs
- Switch to Claude 3 Haiku for non-critical queries
- Implement caching (Phase 3)
- Use shorter system prompts
- Reduce max_tokens where possible

## Recommendation

**For Complens.ai security analysis, stick with Claude 3.5 Sonnet v2** - it provides the best balance of security reasoning, cost, and reliability.

Only upgrade to Opus if you're dealing with extremely complex security scenarios or need maximum reasoning power.
