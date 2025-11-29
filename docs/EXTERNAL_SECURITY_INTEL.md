# External Security Intelligence System

## Overview

Complens.ai integrates with external security data sources to provide real-time vulnerability assessments, plugin security analysis, and compliance checking.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Security Sources                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  NIST NVD    │  │  CVE.org     │  │  Chrome Web  │          │
│  │  API/RSS     │  │  API         │  │  Store API   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Lambda: External Security Service                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  • Fetch from APIs/RSS                                │     │
│  │  • Parse and normalize data                           │     │
│  │  • Cache in PostgreSQL (24-hour TTL)                  │     │
│  │  • AI analysis with Claude (security model)           │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  security_intel table:                                │     │
│  │  - source (nist, cve, chrome_store, etc.)            │     │
│  │  - query (search term, plugin ID, CVE ID)            │     │
│  │  - data (JSON response)                              │     │
│  │  - ai_analysis (Claude's assessment)                 │     │
│  │  - cached_at (timestamp)                             │     │
│  │  - expires_at (cached_at + 24 hours)                 │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Data Sources

### 1. NIST National Vulnerability Database (NVD)

**API**: https://services.nvd.nist.gov/rest/json/cves/2.0

**Use Cases**:
- Search vulnerabilities by keyword (e.g., "WordPress", "Chrome Extension")
- Get CVE details by ID (e.g., CVE-2024-1234)
- Subscribe to RSS feed for latest CVEs

**Example Query**:
```bash
GET https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=chrome+extension
```

**Data Retrieved**:
- CVE ID
- Description
- Severity (CVSS score)
- Published date
- References
- Affected products

### 2. CVE.org

**API**: https://cveawg.mitre.org/api/

**Use Cases**:
- Look up CVE details
- Search by vendor/product
- Get recent CVEs

**Example**:
```bash
GET https://cveawg.mitre.org/api/cve/CVE-2024-1234
```

### 3. Chrome Web Store

**API**: Chrome Web Store API (via scraping or extension ID lookup)

**Use Cases**:
- Look up extension details
- Check update history
- Verify permissions
- Check user reviews for security concerns

**Example**:
```
Extension ID: nmmhkkegccagdldgiimedpiccmgmieda (Google Wallet)
https://chrome.google.com/webstore/detail/nmmhkkegccagdldgiimedpiccmgmieda
```

### 4. Security RSS Feeds

**Sources**:
- NIST NVD RSS: https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml
- US-CERT Alerts: https://www.cisa.gov/uscert/ncas/alerts.xml
- SANS ISC: https://isc.sans.edu/rssfeed.xml

## API Endpoints

### GET /api/security/nist/search

Search NIST NVD for vulnerabilities.

**Query Parameters**:
- `keyword` - Search term (e.g., "wordpress plugin")
- `limit` - Number of results (default: 10)
- `useCache` - Use cached results if available (default: true)

**Response**:
```json
{
  "source": "nist",
  "query": "wordpress plugin",
  "cached": true,
  "cachedAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-16T10:30:00Z",
  "results": [
    {
      "cveId": "CVE-2024-1234",
      "description": "SQL injection in WordPress Plugin XYZ",
      "severity": "HIGH",
      "cvssScore": 7.5,
      "publishedDate": "2024-01-10",
      "references": ["https://..."]
    }
  ],
  "aiAnalysis": "This vulnerability affects WordPress plugins... [Claude's analysis]"
}
```

### GET /api/security/cve/:cveId

Get detailed information about a specific CVE.

**Example**: `/api/security/cve/CVE-2024-1234`

**Response**:
```json
{
  "cveId": "CVE-2024-1234",
  "description": "...",
  "severity": "HIGH",
  "cvssScore": 7.5,
  "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
  "published": "2024-01-10",
  "lastModified": "2024-01-12",
  "references": [],
  "aiAnalysis": "This CVE represents a significant security risk... [Claude's analysis]"
}
```

### GET /api/security/plugin/:pluginId

Look up security information about a browser extension/plugin.

**Example**: `/api/security/plugin/chrome:nmmhkkegccagdldgiimedpiccmgmieda`

**Response**:
```json
{
  "pluginId": "nmmhkkegccagdldgiimedpiccmgmieda",
  "name": "Google Wallet",
  "platform": "chrome",
  "version": "1.2.3",
  "permissions": ["storage", "activeTab"],
  "lastUpdated": "2024-01-10",
  "userCount": "10M+",
  "rating": 4.5,
  "knownVulnerabilities": [
    {
      "cveId": "CVE-2023-5678",
      "severity": "MEDIUM",
      "description": "..."
    }
  ],
  "aiAnalysis": "This extension requests minimal permissions... [Claude's analysis]"
}
```

### GET /api/security/rss/latest

Get latest security alerts from RSS feeds.

**Query Parameters**:
- `source` - RSS source (nist, uscert, sans)
- `limit` - Number of items (default: 10)

**Response**:
```json
{
  "source": "nist",
  "items": [
    {
      "title": "High severity vulnerability in...",
      "link": "https://...",
      "pubDate": "2024-01-15T08:00:00Z",
      "description": "..."
    }
  ],
  "aiAnalysis": "Recent security alerts show... [Claude's summary]"
}
```

## Database Schema

```sql
CREATE TABLE security_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,  -- 'nist', 'cve', 'chrome_store', 'rss'
  query_type VARCHAR(50) NOT NULL,  -- 'keyword', 'cve_id', 'plugin_id', 'feed'
  query_value TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  ai_analysis TEXT,
  cached_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  org_id UUID,  -- Optional: organization-specific cache

  UNIQUE(source, query_type, query_value, org_id)
);

CREATE INDEX idx_security_intel_expires ON security_intel(expires_at);
CREATE INDEX idx_security_intel_query ON security_intel(source, query_type, query_value);
CREATE INDEX idx_security_intel_org ON security_intel(org_id);
```

## Caching Strategy

**Cache Duration**: 24 hours (configurable)

**Cache Key**: `source + query_type + query_value + org_id`

**Cache Invalidation**:
- Automatic: After 24 hours
- Manual: Add `?useCache=false` to API request
- Background: Cron job refreshes popular queries

**Benefits**:
- Reduce external API calls (many have rate limits)
- Faster response times
- Works even if external API is down
- Lower costs (fewer NAT Gateway charges)

## AI Analysis

All external data is analyzed by **Claude 3.5 Sonnet v2** (security model) to provide:

1. **Risk Assessment**: How severe is this vulnerability?
2. **Impact Analysis**: What systems are affected?
3. **Remediation**: What should be done?
4. **Context**: How does this relate to the user's environment?

**Example Prompt**:
```
Analyze this CVE and provide:
1. Risk level (Low/Medium/High/Critical)
2. Affected systems
3. Remediation steps
4. Whether this affects Google Workspace, Chrome extensions, or cloud apps

CVE Data: [JSON]
```

## Rate Limiting

**External APIs**:
- NIST NVD: 5 requests per 30 seconds (no API key), 50/30s (with key)
- CVE.org: No official limit, respect reasonable use
- Chrome Web Store: Scraping-based, use conservative delays

**Our API**:
- No rate limit on cached requests
- Fresh requests: 10 per minute per org

## Implementation Phases

### Phase 1: NIST NVD Integration
- [ ] Create ExternalSecurityService
- [ ] Implement NIST NVD API client
- [ ] Add database schema
- [ ] Create `/api/security/nist/search` endpoint
- [ ] Create `/api/security/cve/:id` endpoint
- [ ] Add caching logic
- [ ] Integrate Claude analysis

### Phase 2: Chrome Web Store
- [ ] Implement Chrome extension lookup
- [ ] Create `/api/security/plugin/:id` endpoint
- [ ] Parse extension permissions
- [ ] Link CVEs to extensions

### Phase 3: RSS Feeds
- [ ] Add RSS parser
- [ ] Create `/api/security/rss/latest` endpoint
- [ ] Background job to refresh feeds
- [ ] Daily digest feature

### Phase 4: Enhanced Analysis
- [ ] Cross-reference vulnerabilities with user's stack
- [ ] Proactive alerts (e.g., "You use Plugin X, CVE found")
- [ ] Trending vulnerabilities dashboard

## Example Use Cases

### Use Case 1: Chrome Extension Security Check

**User asks**: "Is the Grammarly extension safe?"

**System**:
1. Lookup extension ID from Chrome Web Store
2. Check NIST NVD for "Grammarly Chrome extension"
3. Fetch extension permissions
4. Analyze with Claude
5. Return comprehensive security report

### Use Case 2: Vulnerability Monitoring

**User asks**: "Any new WordPress vulnerabilities?"

**System**:
1. Query NIST NVD with keyword "WordPress"
2. Filter by date (last 7 days)
3. Cache results
4. Claude summarizes findings
5. Return report with CVE links

### Use Case 3: CVE Impact Assessment

**User provides**: "CVE-2024-1234"

**System**:
1. Fetch CVE details from NIST
2. Check if it affects user's Google Workspace plugins
3. Analyze severity with Claude
4. Provide remediation steps
5. Store as finding if critical

## Cost Considerations

**External API Calls**:
- NIST NVD: Free (with reasonable use)
- CVE.org: Free
- Chrome Web Store: Free (scraping)

**Our Costs**:
- NAT Gateway: $0.045 per GB (only if enabled)
- Lambda execution: Minimal (cached most of the time)
- AI analysis: ~$0.02 per analysis (Claude 3.5 Sonnet)
- Database storage: ~$0.10/GB/month

**With 24-hour caching**:
- 100 unique queries/day = $2/month for AI analysis
- Cache hit rate: 80% after first day

## Security Considerations

1. **API Keys**: Store NIST API key in Secrets Manager
2. **Rate Limiting**: Implement exponential backoff
3. **Data Validation**: Sanitize external data before storing
4. **Access Control**: Require authentication for API endpoints
5. **Audit Logging**: Log all external API calls

## Next Steps

1. Implement Phase 1 (NIST NVD)
2. Test with real vulnerabilities
3. Add to frontend UI
4. Enable background refresh job
5. Add more sources (Phase 2-4)
