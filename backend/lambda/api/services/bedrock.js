/**
 * AWS Bedrock Service (Nova, Titan & Claude Universal)
 * Handles interactions with Amazon Nova, Amazon Titan, and Anthropic Claude
 * Implements strict Security Persona and Tool Use
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
`;

class BedrockService {
  constructor(region = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });
    this.modelId = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0'; 
    this.defaultMaxTokens = 4096;
  }

  // --- MODEL DETECTION HELPERS ---
  _isNovaModel() { return this.modelId.includes('amazon.nova'); }
  _isTitanModel() { return this.modelId.includes('amazon.titan'); }
  _isClaudeModel() { return this.modelId.includes('anthropic.claude'); }

  /**
   * Builder: Payload for AMAZON NOVA (Converse-style Schema)
   * Structure: { messages: [], system: [], inferenceConfig: { maxTokens: ... } }
   */
  _buildNovaPayload(message, conversationHistory, options) {
    // 1. Format Messages (Nova requires 'content' to be an array of objects)
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: [{ text: msg.content }] // Nova requires strict content blocks
      })),
      { role: 'user', content: [{ text: message }] }
    ];

    // 2. Format System Prompt (List of text blocks)
    const system = [{ text: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}` }];

    // 3. Construct Payload
    return {
      messages: messages,
      system: system,
      inferenceConfig: {
        maxTokens: options.maxTokens || this.defaultMaxTokens,
        temperature: options.temperature || 0.1,
        topP: options.topP || 0.9
      },
      // Nova supports tools via 'toolConfig' (Future implementation)
      toolConfig: options.tools ? { tools: options.tools } : undefined 
    };
  }

  /**
   * Builder: Payload for AMAZON TITAN
   * Structure: { inputText: "...", textGenerationConfig: { ... } }
   */
  _buildTitanPayload(message, conversationHistory, options) {
    const historyText = conversationHistory.map(m => 
      `\n${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`
    ).join('');

    const fullPrompt = `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}\n${historyText}\nUser: ${message}\nBot:`;

    return {
      inputText: fullPrompt,
      textGenerationConfig: {
        maxTokenCount: options.maxTokens || this.defaultMaxTokens,
        stopSequences: ["User:"],
        temperature: options.temperature || 0.1,
        topP: options.topP || 0.9,
      }
    };
  }

  /**
   * Builder: Payload for ANTHROPIC CLAUDE 3/3.5
   * Structure: { messages: [], max_tokens: ..., system: ... }
   */
  _buildClaudePayload(message, conversationHistory, options) {
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || this.defaultMaxTokens,
      messages: messages,
      temperature: options.temperature || 0.1,
      system: [{ text: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}` }],
      tools: options.tools || undefined, 
    };
  }

  /**
   * Master Payload Router
   */
  _buildPayload(message, conversationHistory, options) {
    if (this._isNovaModel()) return this._buildNovaPayload(message, conversationHistory, options);
    if (this._isTitanModel()) return this._buildTitanPayload(message, conversationHistory, options);
    return this._buildClaudePayload(message, conversationHistory, options);
  }

  /**
   * Standard Chat
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const requestBody = this._buildPayload(message, conversationHistory, options);
      
      console.log(`[Bedrock] Invoking ${this.modelId}`);

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // --- NOVA RESPONSE PARSING ---
      if (this._isNovaModel()) {
        // Nova returns: { output: { message: { content: [{ text: "..." }] } } }
        return {
          content: responseBody.output?.message?.content?.[0]?.text || '',
          stopReason: responseBody.stopReason,
          usage: {
            input_tokens: responseBody.usage?.inputTokens || 0,
            output_tokens: responseBody.usage?.outputTokens || 0
          }
        };
      }

      // --- TITAN RESPONSE PARSING ---
      if (this._isTitanModel()) {
        return {
          content: responseBody.results[0].outputText,
          stopReason: responseBody.results[0].completionReason,
          usage: {
            input_tokens: responseBody.inputTextTokenCount,
            output_tokens: responseBody.results[0].tokenCount
          }
        };
      }

      // --- CLAUDE RESPONSE PARSING ---
      return {
        content: responseBody.content.find(c => c.type === 'text')?.text || '',
        stopReason: responseBody.stop_reason,
        usage: {
          input_tokens: responseBody.usage?.input_tokens || 0,
          output_tokens: responseBody.usage?.output_tokens || 0,
        },
      };

    } catch (error) {
      console.error('[Bedrock] Error:', error);
      throw new Error(`Bedrock Analysis failed: ${error.message}`);
    }
  }

  /**
   * Stream Chat
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

      for await (const item of response.body) {
        if (item.chunk) {
          const chunkData = JSON.parse(new TextDecoder().decode(item.chunk.bytes));
          
          // NOVA & CLAUDE share 'content_block_delta' for text, but Nova wraps differently sometimes
          // Check for standard delta first
          if (chunkData.contentBlockDelta?.delta?.text) {
             onChunk(chunkData.contentBlockDelta.delta.text);
          }
          // Claude 3 style
          else if (chunkData.type === 'content_block_delta' && chunkData.delta.text) {
             onChunk(chunkData.delta.text);
          }
          // Titan Style
          else if (chunkData.outputText) {
             onChunk(chunkData.outputText);
          }
        }
      }
    } catch (error) {
      console.error('[Bedrock] Stream Error:', error);
      throw error;
    }
  }

  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities. JSON: ${JSON.stringify(cloudConfigJson)}`;
    return await this.chat(prompt, [], { temperature: 0 });
  }
}

module.exports = { BedrockService };