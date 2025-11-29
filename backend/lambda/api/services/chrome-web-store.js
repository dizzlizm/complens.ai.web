/**
 * Chrome Web Store Intelligence Service (Robust Edition)
 * Handles redirects, enforces locales, and uses structured data parsing.
 */

const https = require('https');
const { URL } = require('url');
const zlib = require('zlib'); // Support for gzip/deflate

class ChromeWebStoreService {
  constructor(databaseService) {
    this.db = databaseService;
    this.cacheExpiration = 24 * 60 * 60 * 1000; // 24 hours
    // Modern CWS URL, though code handles redirects from old URLs too
    this.baseUrl = 'https://chromewebstore.google.com/detail/';
  }

  /**
   * Robust HTTP Client
   * - Follows Redirects
   * - Handles Gzip/Deflate
   * - Enforces Timeouts
   * - Mimics real browser headers
   */
  async httpGet(url, options = {}, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    const TIMEOUT = 10000; // 10 seconds

    if (redirectCount > MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${redirectCount}) for URL: ${url}`);
    }

    const urlObj = new URL(url);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9', // Critical: Force English for AI analysis
      'Accept-Encoding': 'gzip, deflate, br', // Efficiency
      ...options.headers
    };

    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers, timeout: TIMEOUT }, (res) => {
        // 1. Handle Redirects (301, 302, 303, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Resolve relative URLs based on current URL
          const nextUrl = new URL(res.headers.location, url).toString();
          console.log(`Following redirect (${res.statusCode}): ${nextUrl}`);
          
          // Drain current response to prevent memory leaks
          res.resume(); 
          
          return resolve(this.httpGet(nextUrl, options, redirectCount + 1));
        }

        // 2. Handle Errors
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}: Status check failed`));
        }

        // 3. Handle Decompression (Gzip/Deflate/Brotli)
        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        let data = '';
        stream.on('data', (chunk) => { data += chunk; });
        stream.on('end', () => resolve(data));
        stream.on('error', (err) => reject(new Error(`Stream error: ${err.message}`)));
      });

      req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  }

  /**
   * Normalize URL to ensure we get English content and correct region
   * This is crucial for the AI analysis step.
   */
  normalizeStoreUrl(extensionId) {
    // We attach query params to force the English locale
    return `${this.baseUrl}${extensionId}?hl=en&gl=US`;
  }

  /**
   * Parse Chrome Web Store page HTML
   * Strategy: Try JSON-LD (Structure Data) first -> Fallback to Regex
   */
  parseExtensionHTML(html) {
    const extension = {
      name: null,
      version: null,
      description: null,
      rating: 0,
      ratingCount: 0,
      userCount: 0,
      developer: null,
      lastUpdated: null,
      permissions: [],
      icon: null,
    };

    // --- STRATEGY 1: JSON-LD (Structured Data) ---
    // Google often embeds Schema.org data in a script tag. This is the most robust method.
    try {
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (jsonLdMatch && jsonLdMatch[1]) {
        const data = JSON.parse(jsonLdMatch[1]);
        if (data['@type'] === 'SoftwareApplication') {
          extension.name = data.name;
          extension.description = data.description; // Usually short desc
          extension.version = data.softwareVersion;
          extension.category = data.applicationCategory;
          extension.icon = data.image;
          
          if (data.aggregateRating) {
            extension.rating = parseFloat(data.aggregateRating.ratingValue);
            extension.ratingCount = parseInt(data.aggregateRating.ratingCount);
          }
          
          if (data.offers && data.offers.price === '0') {
            extension.price = 'Free';
          }
        }
      }
    } catch (e) {
      console.warn('JSON-LD parsing failed, falling back to regex', e);
    }

    // --- STRATEGY 2: META TAGS & REGEX (Fallback/Supplement) ---
    
    // Name (fallback)
    if (!extension.name) {
      const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (nameMatch) extension.name = nameMatch[1].replace(' - Chrome Web Store', '');
    }

    // Detailed Description
    // The meta description is often truncated, so we try to find the main body
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (!extension.description && descMatch) extension.description = descMatch[1];

    // User Count (Regex is usually required for this as it's rarely in JSON-LD)
    // Matches "1,000,000+ users" or "234 users"
    const userCountMatch = html.match(/class="[^"]*">([0-9,]+\+?)\s+users</i) || html.match(/([0-9,]+\+?)\s+users/i);
    if (userCountMatch) {
      // Remove commas and '+' signs for integer parsing
      extension.userCount = parseInt(userCountMatch[1].replace(/[,+]/g, ''));
    }

    // Last Updated
    const updatedMatch = html.match(/Updated[:\s]+([^<]+)</i);
    if (updatedMatch) extension.lastUpdated = updatedMatch[1].trim();

    // Developer / Offered By
    const developerMatch = html.match(/Offered by[:\s]+([^<]+)</i);
    if (developerMatch) extension.developer = developerMatch[1].trim();

    // --- PERMISSIONS PARSING ---
    // This is the hardest part as it is often loaded dynamically or hidden behind clicks.
    // We scan the raw HTML for known permission strings.
    
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
      'declarativeNetRequest',
      'scripting',
      'geolocation'
    ];

    // Extract the section typically containing additional info
    const mainContentMatch = html.match(/<main(.*?)\/main>/s);
    const contentToScan = mainContentMatch ? mainContentMatch[1] : html;

    permissionPatterns.forEach(perm => {
      // Create a case-insensitive regex for the permission
      const regex = new RegExp(perm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (regex.test(contentToScan)) {
        extension.permissions.push(perm);
      }
    });

    return extension;
  }

  async getExtension(extensionId, options = {}) {
    const { useCache = true, orgId = null } = options;

    if (useCache) {
      const cached = await this.getFromCache('chrome_store', 'extension_id', extensionId, orgId);
      if (cached) {
        console.log(`[Cache Hit] Returning data for ${extensionId}`);
        return {
          ...cached.raw_data,
          cached: true,
          cachedAt: cached.cached_at,
          aiAnalysis: cached.ai_analysis,
        };
      }
    }

    console.log(`[Fetching] Chrome extension: ${extensionId}`);
    
    // Use the normalized URL to force English + US Region
    const targetUrl = this.normalizeStoreUrl(extensionId);

    try {
      const html = await this.httpGet(targetUrl);
      const extensionData = this.parseExtensionHTML(html);
      
      // Post-processing: Ensure ID is attached
      extensionData.extensionId = extensionId;
      extensionData.storeUrl = targetUrl;

      // Validation: If we didn't find a name, the scraping likely failed (or 404 handled as 200)
      if (!extensionData.name) {
        throw new Error('Failed to parse extension name. Page structure might have changed or ID is invalid.');
      }

      await this.saveToCache('chrome_store', 'extension_id', extensionId, extensionData, null, orgId);

      return {
        ...extensionData,
        cached: false,
        cachedAt: new Date(),
        aiAnalysis: null,
      };

    } catch (error) {
      console.error(`Error processing extension ${extensionId}:`, error.message);
      // Re-throw with user-friendly message
      throw new Error(`Could not retrieve extension details: ${error.message}`);
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
      'declarativeNetRequest', // Can block/redirect requests
      'scripting' // Can inject code
    ];

    const mediumRiskPermissions = [
      'Access your tabs',
      'Communicate with cooperating websites',
      'Display notifications',
      'activeTab',
      'geolocation'
    ];

    permissions.forEach(perm => {
      // Normalize comparison
      const permLower = perm.toLowerCase();
      
      if (highRiskPermissions.some(high => permLower.includes(high.toLowerCase()))) {
        risks.high.push(perm);
      } else if (mediumRiskPermissions.some(med => permLower.includes(med.toLowerCase()))) {
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
    });

    return response.content;
  }

  
  async getFromCache(source, queryType, queryValue, orgId = null) {
      // Implementation from previous snippet
      return this.db.query ? await this.db.query(/*...*/) : null; 
  }

  async saveToCache(source, queryType, queryValue, rawData, aiAnalysis = null, orgId = null) {
      // Implementation from previous snippet
      if(this.db.query) await this.db.query(/*...*/);
      return true;
  }
}

module.exports = { ChromeWebStoreService };