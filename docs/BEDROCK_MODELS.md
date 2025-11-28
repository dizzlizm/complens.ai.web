# AWS Bedrock Model Configuration

This document describes the available AWS Bedrock models for Complens.ai and how to switch between them.

## Current Model

**Claude 3.5 Sonnet v2** (Default)
- Model ID: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
- Best for: Security analysis, general reasoning, cost-effective
- Strengths: Excellent security logic, balanced performance
- Cost: ~$3 per million input tokens, ~$15 per million output tokens

## Recommended Models for Security Reasoning

### 1. Claude 3.5 Sonnet v2 (Current Default) ✅
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

### Option 1: Environment Variable (Recommended)

Add to your Lambda environment variables in CloudFormation:
```yaml
Environment:
  Variables:
    BEDROCK_MODEL_ID: 'anthropic.claude-3-opus-20240229-v1:0'
```

### Option 2: Secrets Manager

Add to your secrets in AWS Secrets Manager:
```json
{
  "bedrockModelId": "anthropic.claude-3-opus-20240229-v1:0"
}
```

Then update `backend/lambda/api/services/bedrock.js` to read from secrets.

### Option 3: Direct Code Change

Edit `backend/lambda/api/services/bedrock.js`:
```javascript
this.modelId = process.env.BEDROCK_MODEL_ID || 'YOUR-MODEL-ID-HERE';
```

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

| Model | Input Cost | Output Cost | Total (1M in + 1M out) |
|-------|-----------|-------------|------------------------|
| Claude 3 Haiku | $0.25 | $1.25 | $1.50 |
| Claude 3.5 Sonnet v1/v2 | $3.00 | $15.00 | $18.00 |
| Claude 3 Opus | $15.00 | $75.00 | $90.00 |
| Llama 3.1 405B | $2.65 | $3.50 | $6.15 |
| Mistral Large | $2.00 | $6.00 | $8.00 |

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
