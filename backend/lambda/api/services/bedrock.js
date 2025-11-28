/**
 * AWS Bedrock Service (Universal & Security Enhanced)
 * Handles interactions with ANY Claude model (Legacy or V3/V3.5)
 * Implements strict Security Persona and Tool Use (MCP)
 */

const { 
  BedrockRuntimeClient, 
  InvokeModelCommand, 
  InvokeModelWithResponseStreamCommand 
} = require('@aws-sdk/client-bedrock-runtime');

// 1. Define the Security Persona
const SECURITY_SYSTEM_PROMPT = `
You are Complens.ai, an expert Senior Cloud Security Architect and Compliance Auditor. 
Your goal is to analyze cloud configurations, identify vulnerabilities, and ensure compliance with frameworks like NIST 800-53, SOC2, ISO 27001, and HIPAA.

GUIDELINES:
1. SECURITY FIRST: Prioritize "Secure by Design" and "Least Privilege" principles.
2. EVIDENCE-BASED: When making claims about vulnerabilities, reference specific configuration flaws.
3. CLARITY: Explain complex security concepts simply, but do not omit technical details.
4. REMEDIATION: Always provide specific CLI commands (AWS CLI, Terraform) or console steps to fix issues.
5. TONE: Professional, objective, and vigilant.

If asked to generate code, ensure it is free of hardcoded secrets, uses parameterization, and includes error handling.
`;

class BedrockService {
  constructor(region = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });
    // Defaults to Sonnet 3.5, but falls back gracefully if ENV is set to an older model
    this.modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20240620-v1:0'; 
    this.defaultMaxTokens = 4096;
  }

  /**
   * Helper: Detects if we are using a legacy model (Claude 2.x or Instant)
   * This prevents the "extraneous key" error.
   */
  _isLegacyModel() {
    return this.modelId.includes('claude-v2') || this.modelId.includes('claude-instant');
  }

  /**
   * Core helper to construct the payload dynamically based on Model Version
   */
  _buildPayload(message, conversationHistory, options) {
    // A. LEGACY PAYLOAD (Claude 2 / Instant)
    if (this._isLegacyModel()) {
      // Convert history to string format for legacy models
      const historyText = conversationHistory.map(m => 
        `\n\n${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
      ).join('');
      
      // Inject System Prompt manually into the start of the prompt
      const fullPrompt = `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}\n${historyText}\n\nHuman: ${message}\n\nAssistant:`;

      return {
        prompt: fullPrompt,
        max_tokens_to_sample: options.maxTokens || this.defaultMaxTokens, // Legacy param
        temperature: options.temperature || 0.1,
        top_p: options.topP || 0.9,
      };
    }

    // B. MODERN PAYLOAD (Claude 3 / 3.5)
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Filter out empty system prompts to be clean
    const systemPrompts = [SECURITY_SYSTEM_PROMPT];
    if (options.systemPrompt) systemPrompts.push(options.systemPrompt);

    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || this.defaultMaxTokens, // Modern param
      messages: messages,
      temperature: options.temperature || 0.1,
      system: options.systemPrompt ? 
              [{ text: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt}` }] : 
              [{ text: SECURITY_SYSTEM_PROMPT }], // Claude 3 expects object array or string
      tools: options.tools || undefined, 
    };
  }

  /**
   * Standard Chat (Waiting for full response)
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const requestBody = this._buildPayload(message, conversationHistory, options);

      console.log(`[Bedrock] Invoking ${this.modelId} (Legacy Mode: ${this._isLegacyModel()})`);

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Handle response format differences
      if (this._isLegacyModel()) {
        return {
          content: responseBody.completion || '',
          stopReason: responseBody.stop_reason,
          usage: { input_tokens: 0, output_tokens: 0 } // Legacy doesn't always return usage
        };
      }

      // Modern Response
      return {
        content: responseBody.content.find(c => c.type === 'text')?.text || '',
        toolCalls: responseBody.content.filter(c => c.type === 'tool_use'),
        stopReason: responseBody.stop_reason,
        usage: {
          input_tokens: responseBody.usage?.input_tokens || 0,
          output_tokens: responseBody.usage?.output_tokens || 0,
        },
      };

    } catch (error) {
      console.error('[Bedrock] Error:', error);
      throw new Error(`Bedrock Security Analysis failed: ${error.message}`);
    }
  }

  /**
   * Stream Chat (Real-time response)
   */
  async streamChat(message, conversationHistory = [], onChunk) {
    try {
      const requestBody = this._buildPayload(message, conversationHistory, {});

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);

      // Process the stream
      for await (const item of response.body) {
        if (item.chunk) {
          const chunkData = JSON.parse(new TextDecoder().decode(item.chunk.bytes));
          
          // Legacy Stream Handler
          if (chunkData.completion) {
             onChunk(chunkData.completion);
          }
          
          // Modern Stream Handler (Claude 3)
          else if (chunkData.type === 'content_block_delta' && chunkData.delta.text) {
             onChunk(chunkData.delta.text);
          }
        }
      }
    } catch (error) {
      console.error('[Bedrock] Stream Error:', error);
      throw error;
    }
  }

  /**
   * Security Analysis Helper
   */
  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities (Focus on IAM, S3 Public Access, and Unencrypted EBS). JSON: ${JSON.stringify(cloudConfigJson)}`;
    
    return await this.chat(prompt, [], {
      temperature: 0,
      systemPrompt: 'Provide output in Markdown format with High/Medium/Low risk categorization.',
    });
  }
}

module.exports = { BedrockService };