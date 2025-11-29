/**
 * Security Intelligence Tools for AI
 * Defines tools that the AI can use to gather security context
 */

/**
 * Tool Definitions for Claude Function Calling
 * Each tool describes what it does and its parameters
 */
const SECURITY_TOOLS = [
  {
    name: 'chrome_extension_lookup',
    description: 'Analyze a Chrome browser extension for security risks. Use this when the user asks about Chrome extensions, browser security, or mentions a specific extension name. Returns extension metadata, permissions, risk analysis, and enterprise recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        extension_id: {
          type: 'string',
          description: 'The Chrome Web Store extension ID (e.g., "nmmhkkegccagdldgiimedpiccmgmieda"). If user provides extension name instead of ID, search for the most popular extension with that name.',
        },
      },
      required: ['extension_id'],
    },
  },
  {
    name: 'search_vulnerabilities',
    description: 'Search NIST National Vulnerability Database for security vulnerabilities related to a keyword. Use this when user asks about vulnerabilities, CVEs, security issues in specific software, plugins, or technologies.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Search term (e.g., "wordpress", "chrome extension", "lastpass")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
          default: 10,
        },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'lookup_cve',
    description: 'Get detailed information about a specific CVE (Common Vulnerabilities and Exposures). Use this when user provides a CVE ID or asks about a specific vulnerability.',
    input_schema: {
      type: 'object',
      properties: {
        cve_id: {
          type: 'string',
          description: 'CVE identifier (e.g., "CVE-2024-1234")',
        },
      },
      required: ['cve_id'],
    },
  },
];

/**
 * Get all tool definitions for Claude
 */
function getToolDefinitions() {
  return SECURITY_TOOLS;
}

/**
 * Execute a tool based on tool name and parameters
 */
async function executeTool(toolName, toolInput, services) {
  const { chromeWebStoreService, externalSecurityService, bedrockService } = services;

  console.log(`Executing tool: ${toolName}`, toolInput);

  switch (toolName) {
    case 'chrome_extension_lookup': {
      const { extension_id } = toolInput;

      // Get extension data
      const extensionData = await chromeWebStoreService.getExtension(extension_id, {
        useCache: true,
      });

      // If not cached, generate AI analysis
      if (!extensionData.aiAnalysis && extensionData.name) {
        const analysis = await chromeWebStoreService.analyzeExtensionSecurity(
          extensionData,
          bedrockService
        );
        extensionData.aiAnalysis = analysis;

        // Cache the analysis
        await chromeWebStoreService.updateAIAnalysis(
          'chrome_store',
          'extension_id',
          extension_id,
          analysis
        );
      }

      return {
        success: true,
        data: extensionData,
      };
    }

    case 'search_vulnerabilities': {
      const { keyword, limit = 10 } = toolInput;

      // Search NIST
      const results = await externalSecurityService.searchNIST(keyword, {
        limit,
        useCache: true,
      });

      // If not cached, generate AI analysis
      if (!results.cached && !results.aiAnalysis && results.results.length > 0) {
        const analysis = await externalSecurityService.analyzeWithAI(
          results.results,
          bedrockService
        );
        results.aiAnalysis = analysis;

        // Cache the analysis
        await externalSecurityService.updateAIAnalysis(
          'nist',
          'keyword',
          keyword,
          analysis
        );
      }

      return {
        success: true,
        data: results,
      };
    }

    case 'lookup_cve': {
      const { cve_id } = toolInput;

      // Get CVE details
      const cveData = await externalSecurityService.getCVEDetails(cve_id, {
        useCache: true,
      });

      // If not cached, generate AI analysis
      if (!cveData.aiAnalysis) {
        const analysis = await externalSecurityService.analyzeWithAI(
          cveData,
          bedrockService
        );
        cveData.aiAnalysis = analysis;

        // Cache the analysis
        await externalSecurityService.updateAIAnalysis(
          'nist',
          'cve_id',
          cve_id.toUpperCase(),
          analysis
        );
      }

      return {
        success: true,
        data: cveData,
      };
    }

    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}

module.exports = {
  getToolDefinitions,
  executeTool,
  SECURITY_TOOLS,
};
