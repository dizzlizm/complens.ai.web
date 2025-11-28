/**
 * AWS Bedrock Service
 * Handles interactions with AWS Bedrock models (Nova, Claude, etc.)
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

class BedrockService {
  constructor(region = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });

    // Two different models for different use cases:
    // 1. General chat: Use cheap/fast models (Nova Lite/Micro)
    // 2. Security analysis: Use smart models (Claude 3.5 Sonnet)
    this.chatModelId = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';
    this.securityModelId = process.env.BEDROCK_SECURITY_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

    this.defaultMaxTokens = 4096;

    console.log(`BedrockService initialized:`);
    console.log(`  Chat model: ${this.chatModelId}`);
    console.log(`  Security model: ${this.securityModelId}`);
  }

  /**
   * Determine which model to use based on context
   */
  getModelId(useSecurityModel = false) {
    return useSecurityModel ? this.securityModelId : this.chatModelId;
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

  /**
   * Send a chat message to Bedrock model
   * @param {string} message - User message
   * @param {Array} conversationHistory - Previous messages in conversation
   * @param {Object} options - Additional options (temperature, max_tokens, useSecurityModel, etc.)
   * @returns {Object} - Response from model
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const modelId = this.getModelId(options.useSecurityModel || false);
      const isNova = this.isNovaModel(modelId);
      const isClaude = this.isClaudeModel(modelId);

      // Build messages array
      const messages = [
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: isNova ? msg.content : msg.content, // Both use same format
        })),
        {
          role: 'user',
          content: message,
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
      } else {
        throw new Error(`Unsupported model type: ${modelId}`);
      }

      console.log('Sending request to Bedrock:', {
        modelId,
        modelType: isNova ? 'Nova' : 'Claude',
        messageCount: messages.length,
      });

      // Invoke Bedrock model
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response based on model type
      let content, usage, stopReason;

      if (isClaude) {
        content = responseBody.content[0].text;
        stopReason = responseBody.stop_reason;
        usage = {
          input_tokens: responseBody.usage?.input_tokens || 0,
          output_tokens: responseBody.usage?.output_tokens || 0,
          total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        };
      } else if (isNova) {
        content = responseBody.output?.message?.content[0]?.text || '';
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
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      });

      return {
        content,
        model: modelId,
        stopReason,
        usage,
      };

    } catch (error) {
      console.error('Error calling Bedrock:', error);
      throw new Error(`Bedrock API error: ${error.message}`);
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
    // TODO: Implement streaming using InvokeModelWithResponseStreamCommand
    throw new Error('Streaming not yet implemented');
  }

  /**
   * Analyze text or perform specific tasks
   * Uses security model by default for better reasoning
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
      useSecurityModel: true, // Use smarter model for analysis
    });
  }

  /**
   * Generate embeddings (Note: Claude doesn't support embeddings directly)
   * Use Amazon Titan Embeddings instead
   */
  async getEmbeddings(text) {
    throw new Error('Embeddings not supported by Claude. Use Amazon Titan Embeddings model instead.');
  }
}

module.exports = { BedrockService };
