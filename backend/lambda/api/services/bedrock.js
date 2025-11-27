/**
 * AWS Bedrock Service
 * Handles interactions with Claude Sonnet 4 via AWS Bedrock
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

class BedrockService {
  constructor(region = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });
    this.modelId = 'anthropic.claude-sonnet-4-20250514-v1:0'; // Claude Sonnet 4
    this.defaultMaxTokens = 4096;
  }

  /**
   * Send a chat message to Claude Sonnet 4
   * @param {string} message - User message
   * @param {Array} conversationHistory - Previous messages in conversation
   * @param {Object} options - Additional options (temperature, max_tokens, etc.)
   * @returns {Object} - Response from Claude
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      // Build messages array in Claude format
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

      // Prepare request payload for Claude
      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || this.defaultMaxTokens,
        messages: messages,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        system: options.systemPrompt || 'You are a helpful AI assistant built by Complens.ai.',
      };

      console.log('Sending request to Bedrock:', {
        modelId: this.modelId,
        messageCount: messages.length,
      });

      // Invoke Bedrock model
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);

      // Parse response
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      console.log('Bedrock response received:', {
        stopReason: responseBody.stop_reason,
        inputTokens: responseBody.usage?.input_tokens,
        outputTokens: responseBody.usage?.output_tokens,
      });

      return {
        content: responseBody.content[0].text,
        model: this.modelId,
        stopReason: responseBody.stop_reason,
        usage: {
          input_tokens: responseBody.usage?.input_tokens || 0,
          output_tokens: responseBody.usage?.output_tokens || 0,
          total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        },
      };

    } catch (error) {
      console.error('Error calling Bedrock:', error);
      throw new Error(`Bedrock API error: ${error.message}`);
    }
  }

  /**
   * Stream chat response from Claude Sonnet 4 (for future implementation)
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

  /**
   * Generate embeddings (Note: Claude doesn't support embeddings directly)
   * Use Amazon Titan Embeddings instead
   */
  async getEmbeddings(text) {
    throw new Error('Embeddings not supported by Claude. Use Amazon Titan Embeddings model instead.');
  }
}

module.exports = { BedrockService };
