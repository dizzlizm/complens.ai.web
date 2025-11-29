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

// 1. Define the Security Persona (Concise, Plain Text, Agnostic)
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

    // Single model for all tasks
    this.modelId = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';
    this.defaultMaxTokens = 4096;

    console.log(`BedrockService initialized:`);
    console.log(`  Model: ${this.modelId}`);
  }

  /**
   * Get the model ID
   */
  getModelId() {
    return this.modelId;
  }

  /**
   * Check if model is Amazon Nova (uses different API format)
   */
  isNovaModel(modelId) {
    return modelId.includes('amazon.nova');
  }

  /**
   * Check if model is Claude
   */
  isClaudeModel(modelId) {
    return modelId.includes('anthropic.claude') || modelId.includes('us.anthropic.claude');
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
   * Send a chat message to Bedrock model
   * @param {string} message - User message
   * @param {Array} conversationHistory - Previous messages in conversation
   * @param {Object} options - Additional options (temperature, max_tokens, tools, etc.)
   * @returns {Object} - Response from model
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const modelId = this.getModelId();
      const isNova = this.isNovaModel(modelId);
      const isClaude = this.isClaudeModel(modelId);

      // Helper function to format content based on model type
      const formatContent = (content) => {
        if (typeof content === 'string') {
          // Nova requires array format, Claude accepts string
          return isNova ? [{ text: content }] : content;
        }
        // Already formatted (from conversation history)
        return content;
      };

      // Build messages array with proper format for each model
      const messages = [
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: formatContent(msg.content),
        })),
        {
          role: 'user',
          content: formatContent(message),
        },
      ];

      let requestBody;

      if (isClaude) {
        // Claude API format (Anthropic Messages API)
        requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: options.maxTokens || this.defaultMaxTokens,
          messages: messages,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          system: options.systemPrompt || 'You are a helpful AI assistant built by Complens.ai.',
        };

        // Add tools for Claude (if provided)
        if (options.tools && options.tools.length > 0) {
          requestBody.tools = options.tools;
        }
      } else if (isNova) {
        // Amazon Nova API format (Converse API)
        requestBody = {
          messages: messages,
          system: [{ text: options.systemPrompt || 'You are a helpful AI assistant built by Complens.ai.' }],
          inferenceConfig: {
            maxTokens: options.maxTokens || this.defaultMaxTokens,
            temperature: options.temperature || 0.7,
            topP: options.topP || 0.9,
          },
        };

        // Add tools for Nova (if provided)
        if (options.tools && options.tools.length > 0) {
          requestBody.toolConfig = {
            tools: options.tools.map(tool => ({
              toolSpec: {
                name: tool.name,
                description: tool.description,
                inputSchema: {
                  json: tool.input_schema,
                },
              },
            })),
          };
        }
      } else {
        throw new Error(`Unsupported model type: ${modelId}`);
      }

      console.log('Sending request to Bedrock:', {
        modelId,
        modelType: isNova ? 'Nova' : 'Claude',
        messageCount: messages.length,
      });

      const command = new InvokeModelCommand({
        modelId,
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
      // Parse response based on model type
      let content, usage, stopReason, toolUse;

      if (isClaude) {
        // Claude may return text or tool_use blocks
        const contentBlock = responseBody.content[0];

        if (contentBlock.type === 'text') {
          content = contentBlock.text;
        } else if (contentBlock.type === 'tool_use') {
          toolUse = {
            id: contentBlock.id,
            name: contentBlock.name,
            input: contentBlock.input,
          };
        }

        stopReason = responseBody.stop_reason;
        usage = {
          input_tokens: responseBody.usage?.input_tokens || 0,
          output_tokens: responseBody.usage?.output_tokens || 0,
          total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        };
      } else if (isNova) {
        // Nova may return text or toolUse blocks
        const messageContent = responseBody.output?.message?.content || [];

        for (const block of messageContent) {
          if (block.text) {
            content = block.text;
          } else if (block.toolUse) {
            toolUse = {
              id: block.toolUse.toolUseId,
              name: block.toolUse.name,
              input: block.toolUse.input,
            };
          }
        }

        stopReason = responseBody.stopReason;
        usage = {
          input_tokens: responseBody.usage?.inputTokens || 0,
          output_tokens: responseBody.usage?.outputTokens || 0,
          total_tokens: responseBody.usage?.totalTokens || 0,
        };
      }

      console.log('Bedrock response received:', {
        modelId,
        stopReason,
        hasToolUse: !!toolUse,
        toolName: toolUse?.name,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      });

      return {
        content,
        toolUse,
        model: modelId,
        stopReason,
        usage,
      };

    } catch (error) {
      console.error('[Bedrock] Error:', error);
      throw new Error(`Bedrock Analysis failed: ${error.message}`);
    }
  }

  /**
   * Stream chat response from Claude (for future implementation)
   * @param {string} message - User message
   * @param {Array} conversationHistory - Previous messages
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise} - Resolves when stream completes
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
  /**
   * Analyze text or perform specific tasks
   * @param {string} prompt - Task prompt
   * @param {string} text - Text to analyze
   * @returns {Object} - Analysis result
   */
  async analyze(prompt, text) {
    const systemPrompt = prompt || 'Analyze the following text and provide insights.';

    return await this.chat(text, [], {
      systemPrompt,
      temperature: 0.3, // Lower temperature for analytical tasks
      maxTokens: 2048,
    });
  }

  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities. JSON: ${JSON.stringify(cloudConfigJson)}`;
    return await this.chat(prompt, [], { temperature: 0 });
  }
}

module.exports = { BedrockService };