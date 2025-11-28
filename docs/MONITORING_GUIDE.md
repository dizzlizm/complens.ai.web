# Monitoring and Observability Guide

Complete guide to monitoring your Complens.ai infrastructure and debugging issues.

## Table of Contents

1. [Finding Error Details](#finding-error-details)
2. [CloudWatch Logs](#cloudwatch-logs)
3. [CloudWatch Alarms](#cloudwatch-alarms)
4. [CloudTrail Audit Logs](#cloudtrail-audit-logs)
5. [Log Insights Queries](#log-insights-queries)
6. [Common Debugging Scenarios](#common-debugging-scenarios)

---

## Finding Error Details

### Browser Console (Frontend Errors)

When you see a 500 error in the browser:

1. **Open Browser DevTools** (F12)
2. **Go to Console tab**
3. Look for these messages:
   ```
   Full error response: {error, message, stack}
   Server stack trace: <detailed stack trace>
   ```

The `Full error response` will show you the exact error from the Lambda backend, including:
- Error type/name
- Error message
- Full stack trace (in dev environment)

### CloudWatch Logs (Backend Errors)

**Quick Access:**
1. Go to AWS Console → CloudWatch → Log Groups
2. Find `/aws/lambda/dev-complens-api`
3. Click on the latest log stream
4. Search for "Error processing request"

**What you'll see:**
```
Event: {...}  // The full request
Error processing request: <error message>
Error stack: <full stack trace>
```

---

## CloudWatch Logs

### Lambda Logs

**Location:** `/aws/lambda/dev-complens-api`

**What's logged:**
- Every request (full event object)
- Service initialization status
- Errors with stack traces
- Response times

**How to access:**
```bash
# Via AWS CLI
aws logs tail /aws/lambda/dev-complens-api --follow --region us-east-1

# Via AWS Console
CloudWatch → Log Groups → /aws/lambda/dev-complens-api → Latest stream
```

### API Gateway Logs

**Location:** `/aws/apigateway/dev-complens-api`

**What's logged:**
- Request/response details
- Integration latency
- Error messages
- Request IDs for correlation

**How to access:**
```bash
# Via AWS CLI
aws logs tail /aws/apigateway/dev-complens-api --follow --region us-east-1

# Via AWS Console
CloudWatch → Log Groups → /aws/apigateway/dev-complens-api
```

---

## CloudWatch Alarms

All alarms send notifications to the email you configured in `BILLING_ALERT_EMAIL`.

### Lambda Error Alarm

**Trigger:** More than 5 errors in 5 minutes

**What it means:**
- Lambda is throwing errors
- Could be initialization failures, database issues, or code bugs

**How to investigate:**
1. Check CloudWatch Logs for stack traces
2. Verify Secrets Manager has correct values
3. Check database connectivity
4. Review recent code changes

### Lambda Duration Alarm

**Trigger:** Average execution time > 25 seconds (2 consecutive periods)

**What it means:**
- Lambda is slow (timeout is 30s)
- Could be slow database queries, external API calls, or heavy computation

**How to investigate:**
1. Check CloudWatch Metrics for duration trend
2. Review database query performance
3. Check for external API timeouts
4. Consider increasing memory (faster CPU)

### API Gateway 5xx Error Alarm

**Trigger:** More than 10 5xx errors in 5 minutes

**What it means:**
- Backend is failing
- Lambda errors, timeouts, or integration issues

**How to investigate:**
1. Check Lambda logs for errors
2. Verify Lambda has permissions
3. Check API Gateway integration settings
4. Review recent infrastructure changes

### API Gateway 4xx Error Alarm

**Trigger:** More than 50 4xx errors in 10 minutes

**What it means:**
- Client errors (bad requests, authentication issues)
- Could indicate frontend bugs or API misuse

**How to investigate:**
1. Check API Gateway logs for request patterns
2. Look for common error codes (400, 401, 403, 404)
3. Verify frontend is sending correct data
4. Check CORS configuration

### RDS CPU Alarm

**Trigger:** Average CPU > 80% for 10 minutes

**What it means:**
- Database is under heavy load
- Slow queries or high traffic

**How to investigate:**
1. Check RDS Performance Insights
2. Review slow query logs
3. Look for missing indexes
4. Consider increasing instance size

---

## CloudTrail Audit Logs

**Purpose:** Track all API calls and changes to your AWS resources

**Location:** S3 bucket `<account-id>-dev-complens-cloudtrail`

**What's tracked:**
- Lambda function invocations
- S3 object access (frontend bucket)
- All management events (IAM, CloudFormation, etc.)
- Who made what change and when

**Retention:**
- Dev: 90 days
- Prod: 365 days

**How to access:**
```bash
# Via AWS Console
CloudTrail → Event history → Filter by resource, user, etc.

# Via S3
aws s3 ls s3://<account-id>-dev-complens-cloudtrail/
```

**Use cases:**
- Security audits
- Compliance reporting
- Debugging "who changed what"
- Root cause analysis

---

## Log Insights Queries

Pre-configured queries for quick debugging.

### Lambda Errors Query

**Name:** `dev-complens-lambda-errors`

**What it does:** Shows last 100 Lambda errors

**How to use:**
1. CloudWatch → Logs → Insights
2. Select query: `dev-complens-lambda-errors`
3. Choose time range
4. Click "Run query"

**Query:**
```
fields @timestamp, @message
| filter @message like /Error/
| sort @timestamp desc
| limit 100
```

### API Gateway Errors Query

**Name:** `dev-complens-api-gateway-errors`

**What it does:** Shows API Gateway errors with request IDs

**How to use:**
1. CloudWatch → Logs → Insights
2. Select query: `dev-complens-api-gateway-errors`
3. Choose time range
4. Click "Run query"

**Query:**
```
fields @timestamp, requestId, error.message, error.messageString
| filter @message like /error/
| sort @timestamp desc
| limit 100
```

### Custom Queries

**Find slow Lambda executions:**
```
fields @timestamp, @duration
| filter @type = "REPORT"
| sort @duration desc
| limit 20
```

**Find requests by conversation ID:**
```
fields @timestamp, @message
| filter @message like /conversation-id-here/
| sort @timestamp asc
```

**Count errors by type:**
```
fields @message
| filter @message like /Error/
| stats count() by @message
```

---

## Common Debugging Scenarios

### Scenario 1: 500 Error on POST /chat

**Symptoms:**
- Browser shows "Internal Server Error"
- Frontend console shows 500 status

**Steps:**
1. **Check browser console** for full error response
2. **Check Lambda logs** for "Error processing request"
3. **Look for:**
   - "Service initialization failed" → Secrets/DB issue
   - "Error sending message" → Bedrock issue
   - Stack trace → Code bug

**Common causes:**
- Database not accessible
- Secrets Manager missing values
- Bedrock permissions
- Code bug in chat handler

### Scenario 2: CORS Errors

**Symptoms:**
- "No 'Access-Control-Allow-Origin' header"
- OPTIONS request fails

**Steps:**
1. **Check browser Network tab**
2. Look at OPTIONS request (preflight)
3. Check response headers

**Common causes:**
- OPTIONS handler not deployed
- API Gateway CORS misconfigured
- Lambda not returning CORS headers

### Scenario 3: Lambda Timeout

**Symptoms:**
- Request hangs then fails
- CloudWatch shows "Task timed out after 30.00 seconds"

**Steps:**
1. **Check Lambda duration metrics**
2. **Review logs** for what was running when timeout occurred
3. **Look for:**
   - Database query hanging
   - External API not responding
   - Infinite loop

**Common causes:**
- Slow database queries
- Bedrock API slow/unavailable
- No NAT Gateway (can't reach external services)

### Scenario 4: Database Connection Errors

**Symptoms:**
- "Error initializing services"
- "ECONNREFUSED" or timeout errors

**Steps:**
1. **Check VPC configuration**
   - Lambda in private subnets?
   - Security groups allow traffic?
2. **Check RDS**
   - Is it running?
   - Endpoint correct in Secrets Manager?
3. **Check Secrets Manager**
   - Has correct DB credentials?

**Common causes:**
- Lambda can't reach RDS (security groups)
- RDS not created yet
- Wrong credentials
- Database not initialized

### Scenario 5: High Costs

**Symptoms:**
- Billing alert triggered

**Steps:**
1. **Check Cost Explorer** in AWS Console
2. **Look for:**
   - NAT Gateway data transfer
   - RDS runtime hours
   - Lambda invocations
   - CloudTrail log storage
3. **Review CloudWatch metrics** for usage patterns

**Common causes:**
- NAT Gateway always on (dev environment)
- RDS Aurora always running
- High Lambda invocations
- Large CloudTrail logs

---

## Quick Reference

### Where to Find Logs

| Service | Log Location | Access Method |
|---------|-------------|---------------|
| Lambda | `/aws/lambda/dev-complens-api` | CloudWatch → Log Groups |
| API Gateway | `/aws/apigateway/dev-complens-api` | CloudWatch → Log Groups |
| CloudTrail | S3: `<account>-dev-complens-cloudtrail` | S3 or CloudTrail Console |

### Alarm Email Subjects

| Alarm | Email Subject |
|-------|---------------|
| Billing | `ALARM: dev-complens-billing-alert-100` |
| Lambda Errors | `ALARM: dev-complens-lambda-errors` |
| Lambda Slow | `ALARM: dev-complens-lambda-duration` |
| API 5xx | `ALARM: dev-complens-api-5xx-errors` |
| API 4xx | `ALARM: dev-complens-api-4xx-errors` |
| RDS CPU | `ALARM: dev-complens-rds-cpu` |

### Useful AWS CLI Commands

```bash
# Tail Lambda logs
aws logs tail /aws/lambda/dev-complens-api --follow

# Get latest Lambda errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/dev-complens-api \
  --filter-pattern "Error" \
  --max-items 10

# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name complens-dev

# List CloudTrail events (last hour)
aws cloudtrail lookup-events --max-items 20

# Get API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --dimensions Name=ApiId,Value=<api-id> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

## Best Practices

1. **Always check browser console first** - Frontend logs full error response
2. **Use CloudWatch Insights** - Faster than manual log searching
3. **Correlate request IDs** - Link API Gateway → Lambda logs
4. **Set up SNS notifications** - Get alerted to issues immediately
5. **Review logs regularly** - Catch issues before they become critical
6. **Use CloudTrail for audits** - Track all changes to infrastructure
7. **Monitor costs daily** - Use billing alerts to avoid surprises

---

## Getting Help

If you're still stuck after checking logs:

1. **Capture full error details:**
   - Browser console output
   - CloudWatch log stream link
   - Request ID from API Gateway logs

2. **Gather context:**
   - What changed recently?
   - Does it happen consistently?
   - What was the user trying to do?

3. **Check infrastructure:**
   - `./scripts/check-stack.sh` - Stack status
   - CloudFormation events - Recent changes
   - RDS/Lambda metrics - Resource health
