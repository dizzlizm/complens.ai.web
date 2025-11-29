/**
 * Chrome Web Store Intelligence Service (Production Grade)
 * * Features:
 * - Hybrid Scraping: Tries fast static HTTP first -> falls back to Puppeteer (Headless Browser)
 * - Robust Networking: Follows redirects, handles compression (gzip/br), mimics real browsers
 * - Locale Enforcement: Forces English (hl=en) and US Store (gl=US) for consistent AI analysis
 * - JSON-LD Parsing: Prioritizes structured data over fragile HTML regex
 */

const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

class ChromeWebStoreService {
  constructor(databaseService) {
    this.db = databaseService;
    this.cacheExpiration = 24 * 60 * 60 * 1000; // 24 hours
    this.baseUrl = 'https://chromewebstore.google.com/detail/';
  }

  /**
   * MAIN ENTRY POINT
   * Orchestrates the fetching strategy (Cache -> Static -> Puppeteer)
   */
  async getExtension(extensionId, options = {}) {
    if (!extensionId) throw new Error('Extension ID is required');
    const { useCache = true, orgId = null } = options;

    // 1. Check Cache
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
    
    // Normalize URL: Force English & US Region to avoid translation issues
    const targetUrl = `${this.baseUrl}${extensionId}?hl=en&gl=US`;
    
    let extensionData = null;
    let fetchMethod = 'static';

    // 2. Strategy A: Fast Static Fetch (Low Overhead)
    try {
      const html = await this.httpGet(targetUrl);
      extensionData = this.parseExtensionHTML(html);
      
      // Validation: If name is missing, static fetch likely hit a JS-wall or CAPTCHA
      if (!extensionData.name) {
        throw new Error('Incomplete static parse - likely a JS-only page');
      }
    } catch (error) {
      console.warn(`[Strategy A] Static fetch failed for ${extensionId}: ${error.message}`);
      
      // 3. Strategy B: Headless Browser Fallback (High Robustness)
      console.log(`[Strategy B] Attempting Puppeteer fallback for ${extensionId}...`);
      try {
        fetchMethod = 'puppeteer';
        const html = await this.fetchWithPuppeteer(targetUrl);
        extensionData = this.parseExtensionHTML(html);
      } catch (puppeteerError) {
        console.error(`[Strategy B] Puppeteer failed: ${puppeteerError.message}`);
        throw new Error(`Could not retrieve extension details. Both static and browser strategies failed.`);
      }
    }

    // Final Validation
    if (!extensionData || !extensionData.name) {
      throw new Error(`Failed to parse extension data for ${extensionId}`);
    }

    // Add Metadata
    extensionData.extensionId = extensionId;
    extensionData.storeUrl = targetUrl;
    extensionData.fetchMethod = fetchMethod;

    // 4. Save to Cache
    await this.saveToCache('chrome_store', 'extension_id', extensionId, extensionData, null, orgId);

    return {
      ...extensionData,
      cached: false,
      cachedAt: new Date(),
      aiAnalysis: null,
    };
  }

  /**
   * NETWORK TOOL: Robust HTTP Client
   * Handles Redirects (301/302), Decompression, and Timeouts
   */
  async httpGet(url, headers = {}, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    if (redirectCount > MAX_REDIRECTS) throw new Error('Too many redirects');

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers
      },
      timeout: 10000 // 10s timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.get(url, options, (res) => {
        // Handle Redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume(); // Drain
          return resolve(this.httpGet(nextUrl, headers, redirectCount + 1));
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        // Handle Decompression
        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

        let data = '';
        stream.on('data', c => data += c);
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  /**
   * NETWORK TOOL: Headless Browser (Puppeteer)
   * Lazy-loaded to save resources. Uses stealth plugins to evade detection.
   */
  async fetchWithPuppeteer(url) {
    // Lazy load dependencies
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');

    puppeteer.use(StealthPlugin());
    puppeteer.use(AnonymizeUAPlugin());

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Try to expand "Read More" sections to reveal permissions
      try {
        const selectors = ['button[aria-label="About this extension"]', 'button:contains("Read more")', '.ExpandableText__button'];
        for (const sel of selectors) {
          const btn = await page.$(sel);
          if (btn) await btn.click().catch(() => {});
        }
        // Wait briefly for expansion
        await new Promise(r => setTimeout(r, 500));
      } catch (e) { /* Continue even if click fails */ }

      return await page.content();
    } finally {
      await browser.close();
    }
  }

  /**
   * PARSING TOOL: Universal HTML Parser
   * Works on both Static HTML and Puppeteer-rendered DOM
   */
  parseExtensionHTML(html) {
    const extension = {
      name: null, description: null, version: null,
      rating: 0, ratingCount: 0, userCount: 0,
      developer: null, lastUpdated: null, permissions: [],
      icon: null
    };

    // 1. JSON-LD Strategy (Most Reliable)
    try {
      const jsonMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        if (data['@type'] === 'SoftwareApplication') {
          extension.name = data.name;
          extension.description = data.description;
          extension.version = data.softwareVersion;
          extension.category = data.applicationCategory;
          extension.icon = data.image;
          if (data.aggregateRating) {
            extension.rating = parseFloat(data.aggregateRating.ratingValue);
            extension.ratingCount = parseInt(data.aggregateRating.ratingCount);
          }
        }
      }
    } catch (e) { console.warn('JSON-LD parse error', e.message); }

    // 2. Regex Strategy (Fallback)
    if (!extension.name) {
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (titleMatch) extension.name = titleMatch[1].replace(' - Chrome Web Store', '');
    }

    if (!extension.description) {
      const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
      if (descMatch) extension.description = descMatch[1];
    }

    const devMatch = html.match(/Offered by[:\s]+([^<]+)</i);
    if (devMatch) extension.developer = devMatch[1].trim();

    const updateMatch = html.match(/Updated[:\s]+([^<]+)</i);
    if (updateMatch) extension.lastUpdated = updateMatch[1].trim();

    const userMatch = html.match(/([0-9,]+\+?)\s+users/i);
    if (userMatch) extension.userCount = parseInt(userMatch[1].replace(/[,+]/g, ''));

    // 3. Permission Scan (Text-based)
    // We scan the raw text for permission keywords
    const textContent = html.replace(/<[^>]+>/g, ' '); 
    const riskPatterns = [
      'Read and change all your data', 'Read your browsing history',
      'Manage your downloads', 'Access your tabs', 'Communicate with cooperating websites',
      'Display notifications', 'Manage your apps, extensions, and themes',
      'storage', 'cookies', 'webRequest', 'activeTab', 'declarativeNetRequest', 'scripting'
    ];

    riskPatterns.forEach(perm => {
      if (textContent.includes(perm)) extension.permissions.push(perm);
    });

    return extension;
  }

  /**
   * SECURITY ANALYSIS: Categorize Permissions
   */
  analyzePermissions(permissions) {
    const risks = { high: [], medium: [], low: [] };
    const highRisk = ['Read and change all your data', 'Read your browsing history', 'Manage your downloads', 'webRequest', 'cookies', 'scripting'];
    const mediumRisk = ['Access your tabs', 'Communicate with cooperating websites', 'Display notifications', 'activeTab', 'geolocation'];

    permissions.forEach(perm => {
      const p = perm.toLowerCase();
      if (highRisk.some(h => p.includes(h.toLowerCase()))) risks.high.push(perm);
      else if (mediumRisk.some(m => p.includes(m.toLowerCase()))) risks.medium.push(perm);
      else risks.low.push(perm);
    });
    return risks;
  }

  /**
   * AI ANALYSIS: Generate Security Report via Bedrock
   */
  async analyzeExtensionSecurity(extensionData, bedrockService) {
    const permissionRisks = this.analyzePermissions(extensionData.permissions || []);
    
    const prompt = `Analyze this Chrome browser extension for enterprise security risks:
    
    Extension: ${extensionData.name}
    Developer: ${extensionData.developer || 'Unknown'}
    Users: ${extensionData.userCount}
    Rating: ${extensionData.rating} (${extensionData.ratingCount} reviews)
    Last Updated: ${extensionData.lastUpdated}
    
    Permissions Detected:
    - High Risk: ${permissionRisks.high.join(', ') || 'None'}
    - Medium Risk: ${permissionRisks.medium.join(', ') || 'None'}
    
    Provide:
    1. Risk Level (Low/Medium/High/Critical)
    2. Specific Security Concerns
    3. Red Flags (outdated, suspicious permissions, etc.)
    4. Recommendation (Approve/Block)`;

    const response = await bedrockService.chat(prompt, [], {
      systemPrompt: 'You are a cybersecurity analyst specializing in browser extension threats.',
      temperature: 0.3
    });

    // Update the cache with the new AI analysis
    await this.updateAIAnalysis('chrome_store', 'extension_id', extensionData.extensionId, response.content);
    
    return response.content;
  }

  /**
   * DATABASE: Get Cached Item
   */
  async getFromCache(source, queryType, queryValue, orgId = null) {
    if (!queryValue) return null;
    const result = await this.db.query(
      `SELECT id, raw_data, ai_analysis, cached_at, expires_at
       FROM security_intel
       WHERE source = $1 AND query_type = $2 AND query_value = $3
         AND (org_id = $4 OR org_id IS NULL)
         AND expires_at > NOW()
       ORDER BY cached_at DESC LIMIT 1`,
      [source, queryType, queryValue, orgId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * DATABASE: Save Item
   */
  async saveToCache(source, queryType, queryValue, rawData, aiAnalysis = null, orgId = null) {
    const expiresAt = new Date(Date.now() + this.cacheExpiration);
    // Safe-guard against undefined parameters
    const safeOrgId = orgId === undefined ? null : orgId;
    const safeAi = aiAnalysis === undefined ? null : aiAnalysis;

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
      [source, queryType, queryValue, JSON.stringify(rawData), safeAi, expiresAt, safeOrgId]
    );
    return result.rows[0].id;
  }

  async updateAIAnalysis(source, queryType, queryValue, analysis, orgId = null) {
    const safeOrgId = orgId === undefined ? null : orgId;
    await this.db.query(
      `UPDATE security_intel SET ai_analysis = $1
       WHERE source = $2 AND query_type = $3 AND query_value = $4
       AND (org_id = $5 OR org_id IS NULL)`,
      [analysis, source, queryType, queryValue, safeOrgId]
    );
  }
}

module.exports = { ChromeWebStoreService };