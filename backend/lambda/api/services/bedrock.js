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
   * @param {Object} options - Additional options (temperature, max_tokens, useSecurityModel, tools, etc.)
   * @returns {Object} - Response from model
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const modelId = this.getModelId(options.useSecurityModel || false);
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
