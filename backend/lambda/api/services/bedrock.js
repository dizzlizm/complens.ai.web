/**
 * AWS Bedrock Service
 * Optimized for Amazon Nova and Anthropic Claude using the unified Converse API.
 * * Note: Requires @aws-sdk/client-bedrock-runtime v3.577.0 or higher.
 */

const { 
  BedrockRuntimeClient, 
  ConverseCommand 
} = require('@aws-sdk/client-bedrock-runtime');

// Security Persona & Rules
const SECURITY_SYSTEM_PROMPT = `
You are Complens.ai, a Senior Cloud Security Architect. Analyze cloud configs for NIST 800-53, SOC2, ISO 27001, and HIPAA compliance.

STRICT OUTPUT RULES:
1. CONCISE: Be direct. No fluff.
2. PLAIN TEXT ONLY: Do NOT use Markdown, bolding (**), italics, headers (#), or lists. Use simple spacing/indentation only.
3. AGNOSTIC: Do NOT provide specific CLI commands, Terraform code, or vendor-specific implementation details.
4. CITATIONS: You MUST reference specific control IDs (e.g., NIST AC-6, SOC2 CC6.1) in the Agnostic Output.
5. FORMAT: Follow this exact flow for each finding:
   [SEVERITY: HIGH/MED/LOW] Issue -> Risk -> Suggestion -> Agnostic Output

DEFINITIONS:
- Issue: The specific misconfiguration found.
- Risk: The security consequence (e.g., Data Exfiltration).
- Suggestion: High-level fix strategy.
- Agnostic Output: The vendor-neutral architectural requirement including Compliance Control IDs.
`;

class BedrockService {
  constructor(region = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });
    this.modelId = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';
    
    console.log(`BedrockService initialized: ${this.modelId}`);
  }

  /**
   * Main Agentic Interaction Loop
   * Handles conversation history and automatic tool execution loops.
   */
  async agentChat(message, conversationHistory = [], options = {}) {
    const { services } = options;
    const MAX_LOOPS = 5;
    let loopCount = 0;

    // Load tool executor lazily
    let executeTool;
    try { executeTool = require('./tools').executeTool; } catch (e) { }

    // Prepare initial conversation state
    // Clone history to prevent mutation of the original array
    const messages = [...conversationHistory];
    
    // Add user message if it's the start of this turn
    // (If we are recursing inside this function, 'message' might be null/empty if we just want to continue)
    if (message) {
      messages.push({ role: 'user', content: [{ text: message }] });
    }

    // Agent Loop
    while (loopCount < MAX_LOOPS) {
      loopCount++;

      try {
        // 1. Send Request to Bedrock
        const response = await this._invokeConverse(messages, options);
        
        // 2. Append Assistant Response to History
        const assistantMessage = response.output.message;
        messages.push(assistantMessage);

        // 3. Check Stop Reason
        if (response.stopReason !== 'tool_use') {
          // Final answer received
          return {
            content: assistantMessage.content[0]?.text || '',
            history: messages,
            usage: response.usage
          };
        }

        // 4. Handle Tool Use
        const toolRequests = assistantMessage.content.filter(c => c.toolUse);
        if (toolRequests.length === 0) break; // Should not happen if stopReason is tool_use

        // Create the "User" response block containing tool results
        const toolResults = [];

        for (const req of toolRequests) {
          const { toolUseId, name, input } = req.toolUse;
          console.log(`[Agent] Executing: ${name}`);

          let resultData;
          try {
            if (!executeTool) throw new Error("Tool execution module missing");
            const result = await executeTool(name, input, services);
            resultData = result; // Pass full object (success/data)
          } catch (err) {
            console.error(`[Agent] Tool Error (${name}):`, err);
            resultData = { error: err.message };
          }

          // Format result for Converse API
          toolResults.push({
            toolResult: {
              toolUseId: toolUseId,
              content: [{ json: resultData }],
              status: 'success'
            }
          });
        }

        // Append Tool Results as a User message
        messages.push({ role: 'user', content: toolResults });
        
        // Loop continues to let model analyze results...

      } catch (error) {
        console.error('[Bedrock] Agent Loop Error:', error);
        return { 
          content: "I encountered an error processing your request.", 
          error: error.message 
        };
      }
    }

    return { content: "Error: Maximum conversation turns reached." };
  }

  /**
   * Low-level Converse API Wrapper
   */
  async _invokeConverse(messages, options) {
    // Map internal tool definitions to Bedrock 'toolSpec' format
    let toolConfig = undefined;
    if (options.tools && options.tools.length > 0) {
      toolConfig = {
        tools: options.tools.map(t => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: { json: t.input_schema }
          }
        }))
      };
    }

    const command = new ConverseCommand({
      modelId: this.modelId,
      messages: messages,
      system: [{ text: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}` }],
      inferenceConfig: {
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.1,
        topP: 0.9
      },
      toolConfig: toolConfig
    });

    console.log(`[Bedrock] Invoking ${this.modelId} (Turns: ${messages.length})`);
    return await this.client.send(command);
  }

  // --- Helpers for simple analysis ---

  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities. JSON: ${JSON.stringify(cloudConfigJson)}`;
    // Simple wrapper using agentChat with no tools
    const res = await this.agentChat(prompt, [], { temperature: 0 });
    return res;
  }
}

module.exports = { BedrockService };