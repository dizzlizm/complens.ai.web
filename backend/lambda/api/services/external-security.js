/**
 * External Security Intelligence Service
 * Fetches vulnerability data from NIST NVD, CVE.org, and other sources
 */

const https = require('https');

class ExternalSecurityService {
  constructor(databaseService) {
    this.db = databaseService;
    this.nistApiKey = process.env.NIST_API_KEY; // Optional, increases rate limit
    this.cacheExpiration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Helper: Make HTTPS request
   */
  async httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              resolve(data); // Return raw if not JSON
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Check cache for existing data
   */
  async getFromCache(source, queryType, queryValue, orgId = null) {
    const result = await this.db.query(
      `SELECT id, raw_data, ai_analysis, cached_at, expires_at
       FROM security_intel
       WHERE source = $1
         AND query_type = $2
         AND query_value = $3
         AND (org_id = $4 OR org_id IS NULL)
         AND expires_at > NOW()
       ORDER BY cached_at DESC
       LIMIT 1`,
      [source, queryType, queryValue, orgId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Save data to cache
   */
  async saveToCache(source, queryType, queryValue, rawData, aiAnalysis = null, orgId = null) {
    const expiresAt = new Date(Date.now() + this.cacheExpiration);

    const result = await this.db.query(
      `INSERT INTO security_intel (source, query_type, query_value, raw_data, ai_analysis, expires_at, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source, query_type, query_value, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET
         raw_data = EXCLUDED.raw_data,
         ai_analysis = EXCLUDED.ai_analysis,
         cached_at = NOW(),
         expires_at = EXCLUDED.expires_at
       RETURNING id`,
      [source, queryType, queryValue, JSON.stringify(rawData), aiAnalysis, expiresAt, orgId]
    );

    return result.rows[0].id;
  }

  /**
   * Search NIST NVD for vulnerabilities
   */
  async searchNIST(keyword, options = {}) {
    const {
      limit = 10,
      useCache = true,
      orgId = null,
    } = options;

    // Check cache first
    if (useCache) {
      const cached = await this.getFromCache('nist', 'keyword', keyword, orgId);
      if (cached) {
        console.log('Returning cached NIST data');
        return {
          source: 'nist',
          query: keyword,
          cached: true,
          cachedAt: cached.cached_at,
          expiresAt: cached.expires_at,
          results: cached.raw_data.vulnerabilities || [],
          aiAnalysis: cached.ai_analysis,
        };
      }
    }

    // Fetch from NIST API
    console.log(`Fetching from NIST NVD: ${keyword}`);

    const baseUrl = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
    const params = new URLSearchParams({
      keywordSearch: keyword,
      resultsPerPage: limit,
    });

    const headers = {};
    if (this.nistApiKey) {
      headers['apiKey'] = this.nistApiKey;
    }

    try {
      const data = await this.httpGet(`${baseUrl}?${params}`, headers);

      // Parse and normalize results
      const vulnerabilities = (data.vulnerabilities || []).map(item => {
        const cve = item.cve;
        const metrics = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV2?.[0];

        return {
          cveId: cve.id,
          description: cve.descriptions?.find(d => d.lang === 'en')?.value || 'No description',
          severity: metrics?.cvssData?.baseSeverity || 'UNKNOWN',
          cvssScore: metrics?.cvssData?.baseScore || 0,
          publishedDate: cve.published,
          lastModified: cve.lastModified,
          references: cve.references?.slice(0, 3).map(r => r.url) || [],
        };
      });

      // Save to cache (without AI analysis for now)
      await this.saveToCache('nist', 'keyword', keyword, { vulnerabilities }, null, orgId);

      return {
        source: 'nist',
        query: keyword,
        cached: false,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + this.cacheExpiration),
        results: vulnerabilities,
        aiAnalysis: null, // Will be added separately
      };

    } catch (error) {
      console.error('Error fetching from NIST:', error);
      throw new Error(`NIST API error: ${error.message}`);
    }
  }

  /**
   * Get CVE details by ID
   */
  async getCVEDetails(cveId, options = {}) {
    const {
      useCache = true,
      orgId = null,
    } = options;

    // Normalize CVE ID
    const normalizedCveId = cveId.toUpperCase();

    // Check cache
    if (useCache) {
      const cached = await this.getFromCache('nist', 'cve_id', normalizedCveId, orgId);
      if (cached) {
        console.log('Returning cached CVE data');
        return {
          ...cached.raw_data,
          cached: true,
          cachedAt: cached.cached_at,
          aiAnalysis: cached.ai_analysis,
        };
      }
    }

    // Fetch from NIST API
    console.log(`Fetching CVE from NIST: ${normalizedCveId}`);

    const baseUrl = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
    const params = new URLSearchParams({
      cveId: normalizedCveId,
    });

    const headers = {};
    if (this.nistApiKey) {
      headers['apiKey'] = this.nistApiKey;
    }

    try {
      const data = await this.httpGet(`${baseUrl}?${params}`, headers);

      if (!data.vulnerabilities || data.vulnerabilities.length === 0) {
        throw new Error(`CVE ${normalizedCveId} not found`);
      }

      const cve = data.vulnerabilities[0].cve;
      const metrics = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV2?.[0];

      const cveDetails = {
        cveId: cve.id,
        description: cve.descriptions?.find(d => d.lang === 'en')?.value || 'No description',
        severity: metrics?.cvssData?.baseSeverity || 'UNKNOWN',
        cvssScore: metrics?.cvssData?.baseScore || 0,
        cvssVector: metrics?.cvssData?.vectorString || '',
        published: cve.published,
        lastModified: cve.lastModified,
        references: cve.references?.map(r => ({
          url: r.url,
          source: r.source,
        })) || [],
        affectedProducts: cve.configurations?.nodes?.flatMap(node =>
          node.cpeMatch?.map(cpe => cpe.criteria) || []
        ) || [],
      };

      // Save to cache
      await this.saveToCache('nist', 'cve_id', normalizedCveId, cveDetails, null, orgId);

      return {
        ...cveDetails,
        cached: false,
        cachedAt: new Date(),
        aiAnalysis: null,
      };

    } catch (error) {
      console.error('Error fetching CVE:', error);
      throw new Error(`CVE lookup error: ${error.message}`);
    }
  }

  /**
   * Analyze security data with AI
   */
  async analyzeWithAI(data, bedrockService) {
    const prompt = `Analyze this security vulnerability data and provide:
1. Risk level (Low/Medium/High/Critical)
2. Impact summary (what systems/users are affected)
3. Recommended actions
4. Whether this is relevant to Google Workspace, Chrome extensions, or cloud applications

Data: ${JSON.stringify(data, null, 2)}

Provide a concise, actionable security assessment.`;

    const response = await bedrockService.chat(prompt, [], {
      systemPrompt: 'You are a cybersecurity expert analyzing vulnerabilities. Provide clear, actionable security assessments.',
      temperature: 0.3,
      maxTokens: 1024,
    });

    return response.content;
  }

  /**
   * Update cached item with AI analysis
   */
  async updateAIAnalysis(source, queryType, queryValue, analysis, orgId = null) {
    await this.db.query(
      `UPDATE security_intel
       SET ai_analysis = $1
       WHERE source = $2
         AND query_type = $3
         AND query_value = $4
         AND (org_id = $5 OR org_id IS NULL)`,
      [analysis, source, queryType, queryValue, orgId]
    );
  }

  /**
   * Clean up expired cache entries
   */
  async cleanExpiredCache() {
    const result = await this.db.query(
      `DELETE FROM security_intel
       WHERE expires_at < NOW()
       RETURNING id`
    );

    console.log(`Cleaned ${result.rowCount} expired cache entries`);
    return result.rowCount;
  }
}

module.exports = { ExternalSecurityService };
