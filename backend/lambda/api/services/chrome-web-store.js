/**
 * Chrome Web Store Intelligence Service
 * Fetches extension data, analyzes permissions, and provides security insights
 */

const https = require('https');

class ChromeWebStoreService {
  constructor(databaseService) {
    this.db = databaseService;
    this.cacheExpiration = 24 * 60 * 60 * 1000; // 24 hours
    this.baseUrl = 'https://chrome.google.com/webstore/detail';
  }

  /**
   * Helper: Make HTTPS GET request
   */
  async httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              // Not JSON, return raw HTML
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Parse Chrome Web Store page HTML for extension details
   * (Chrome Web Store doesn't have a public API, so we scrape)
   */
  parseExtensionHTML(html) {
    const extension = {
      name: null,
      version: null,
      description: null,
      rating: null,
      ratingCount: null,
      userCount: null,
      developer: null,
      developerWebsite: null,
      category: null,
      lastUpdated: null,
      size: null,
      permissions: [],
      screenshots: [],
    };

    // Extract name
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (nameMatch) extension.name = nameMatch[1];

    // Extract description
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (descMatch) extension.description = descMatch[1];

    // Extract rating (look for star rating)
    const ratingMatch = html.match(/class="[^"]*rating[^"]*"[^>]*>([0-9.]+)/i);
    if (ratingMatch) extension.rating = parseFloat(ratingMatch[1]);

    // Extract user count
    const userCountMatch = html.match(/([0-9,]+)\s*users/i);
    if (userCountMatch) {
      extension.userCount = parseInt(userCountMatch[1].replace(/,/g, ''));
    }

    // Extract version
    const versionMatch = html.match(/Version[:\s]+([0-9.]+)/i);
    if (versionMatch) extension.version = versionMatch[1];

    // Extract last updated
    const updatedMatch = html.match(/Updated[:\s]+([^<]+)</i);
    if (updatedMatch) extension.lastUpdated = updatedMatch[1].trim();

    // Extract developer
    const developerMatch = html.match(/Offered by[:\s]+([^<]+)</i);
    if (developerMatch) extension.developer = developerMatch[1].trim();

    // Extract permissions from manifest or page
    const permissionsMatch = html.match(/<div[^>]*permissions[^>]*>(.*?)<\/div>/is);
    if (permissionsMatch) {
      const permText = permissionsMatch[1];
      // Common Chrome permissions
      const permissionPatterns = [
        'Read and change all your data',
        'Read your browsing history',
        'Manage your downloads',
        'Access your tabs',
        'Communicate with cooperating websites',
        'Display notifications',
        'Manage your apps, extensions, and themes',
        'storage',
        'cookies',
        'webRequest',
        'activeTab',
      ];

      permissionPatterns.forEach(perm => {
        if (permText.toLowerCase().includes(perm.toLowerCase())) {
          extension.permissions.push(perm);
        }
      });
    }

    return extension;
  }

  /**
   * Get extension details from Chrome Web Store
   */
  async getExtension(extensionId, options = {}) {
    const { useCache = true, orgId = null } = options;

    // Check cache first
    if (useCache) {
      const cached = await this.getFromCache('chrome_store', 'extension_id', extensionId, orgId);
      if (cached) {
        console.log('Returning cached Chrome extension data');
        return {
          ...cached.raw_data,
          cached: true,
          cachedAt: cached.cached_at,
          aiAnalysis: cached.ai_analysis,
        };
      }
    }

    // Fetch from Chrome Web Store
    console.log(`Fetching Chrome extension: ${extensionId}`);
    const url = `${this.baseUrl}/${extensionId}`;

    try {
      const html = await this.httpGet(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });

      const extensionData = this.parseExtensionHTML(html);
      extensionData.extensionId = extensionId;
      extensionData.storeUrl = url;

      // Save to cache
      await this.saveToCache('chrome_store', 'extension_id', extensionId, extensionData, null, orgId);

      return {
        ...extensionData,
        cached: false,
        cachedAt: new Date(),
        aiAnalysis: null,
      };

    } catch (error) {
      console.error('Error fetching Chrome extension:', error);
      throw new Error(`Chrome Web Store error: ${error.message}`);
    }
  }

  /**
   * Analyze extension permissions for security risks
   */
  analyzePermissions(permissions) {
    const risks = {
      high: [],
      medium: [],
      low: [],
    };

    const highRiskPermissions = [
      'Read and change all your data',
      'Read your browsing history',
      'Manage your downloads',
      'webRequest',
      'cookies',
    ];

    const mediumRiskPermissions = [
      'Access your tabs',
      'Communicate with cooperating websites',
      'Display notifications',
      'activeTab',
    ];

    permissions.forEach(perm => {
      if (highRiskPermissions.some(high => perm.includes(high))) {
        risks.high.push(perm);
      } else if (mediumRiskPermissions.some(med => perm.includes(med))) {
        risks.medium.push(perm);
      } else {
        risks.low.push(perm);
      }
    });

    return risks;
  }

  /**
   * AI-powered security analysis of Chrome extension
   */
  async analyzeExtensionSecurity(extensionData, bedrockService) {
    const permissionRisks = this.analyzePermissions(extensionData.permissions || []);

    const prompt = `Analyze this Chrome browser extension for security risks:

Extension: ${extensionData.name}
Developer: ${extensionData.developer}
Version: ${extensionData.version}
Users: ${extensionData.userCount ? extensionData.userCount.toLocaleString() : 'Unknown'}
Rating: ${extensionData.rating || 'Unknown'} stars
Last Updated: ${extensionData.lastUpdated}

Permissions:
${extensionData.permissions ? extensionData.permissions.join('\n') : 'No permissions listed'}

Permission Risk Analysis:
- High Risk: ${permissionRisks.high.join(', ') || 'None'}
- Medium Risk: ${permissionRisks.medium.join(', ') || 'None'}
- Low Risk: ${permissionRisks.low.join(', ') || 'None'}

Provide:
1. Security Risk Level (Low/Medium/High/Critical)
2. Key Security Concerns (specific to permissions and update frequency)
3. Red Flags (if any): outdated, suspicious permissions, low ratings, etc.
4. Recommendations for enterprise/workspace use
5. Safe alternatives (if this is high risk)

Be specific and actionable.`;

    const response = await bedrockService.chat(prompt, [], {
      systemPrompt: 'You are a browser extension security expert. Analyze extensions for enterprise security risks, data privacy issues, and compliance concerns.',
      temperature: 0.3,
      maxTokens: 1024,
      useSecurityModel: true,
    });

    return response.content;
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
   * Update AI analysis for cached item
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
}

module.exports = { ChromeWebStoreService };
