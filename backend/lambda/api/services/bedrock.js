/**
 * AWS Bedrock Service (Security Enhanced)
 * Handles interactions with Claude Sonnet via AWS Bedrock
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
    // Note: Verify exact Model ID in AWS Console. Currently, Sonnet 3.5 is usually 'us.anthropic.claude-3-5-sonnet-20240620-v1:0'
    this.modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20240620-v1:0'; 
    this.defaultMaxTokens = 4096;
  }

  /**
   * Core helper to construct the payload
   */
  _buildPayload(message, conversationHistory, options) {
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

    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || this.defaultMaxTokens,
      messages: messages,
      temperature: options.temperature || 0.1, // Low temp for factual security analysis
      system: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}`, // Merge base persona with specific context
      // 2. THIS IS WHERE MCP / TOOLS ARE CONFIGURED
      tools: options.tools || undefined, 
    };
  }

  /**
   * Standard Chat (Waiting for full response)
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const requestBody = this._buildPayload(message, conversationHistory, options);

      console.log(`[Bedrock] Invoking ${this.modelId} (Tools: ${options.tools ? options.tools.length : 0})`);

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return {
        content: responseBody.content.find(c => c.type === 'text')?.text || '',
        toolCalls: responseBody.content.filter(c => c.type === 'tool_use'), // Capture MCP Tool requests
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
   * Essential for long security reports
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
          
          // Handle content block deltas (text generation)
          if (chunkData.type === 'content_block_delta' && chunkData.delta.text) {
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
   * Wraps the chat with specific analytical parameters
   */
  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities (Focus on IAM, S3 Public Access, and Unencrypted EBS). JSON: ${JSON.stringify(cloudConfigJson)}`;
    
    return await this.chat(prompt, [], {
      temperature: 0, // Deterministic for auditing
      systemPrompt: 'Provide output in Markdown format with High/Medium/Low risk categorization.',
    });
  }
}

module.exports = { BedrockService };