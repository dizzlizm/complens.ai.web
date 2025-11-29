/**
 * AWS Bedrock Service (Nova, Titan & Claude Universal)
 * Handles interactions with Amazon Nova, Amazon Titan, and Anthropic Claude
 * Implements strict Security Persona and Tool Use Loop
 */

const { 
  BedrockRuntimeClient, 
  InvokeModelCommand, 
  InvokeModelWithResponseStreamCommand 
} = require('@aws-sdk/client-bedrock-runtime');

// 1. Define the Security Persona
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
    this.defaultMaxTokens = 4096;

    console.log(`BedrockService initialized: Model: ${this.modelId}`);
  }

  getModelId() { return this.modelId; }
  isNovaModel(modelId) { return modelId.includes('amazon.nova'); }
  isClaudeModel(modelId) { return modelId.includes('anthropic.claude'); }

  // --- PAYLOAD BUILDERS ---

  /**
   * Helper: Ensure content is in the correct format for the model
   */
  _formatContent(content, isNova) {
    // If it's already an array (structured blocks), return it
    if (Array.isArray(content)) return content;
    // If it's a string, format it based on model needs
    if (typeof content === 'string') {
      return isNova ? [{ text: content }] : content;
    }
    return content;
  }

  /**
   * Builder: Payload for AMAZON NOVA
   */
  _buildNovaPayload(message, conversationHistory, options) {
    // 1. Format History
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: this._formatContent(msg.content, true)
    }));

    // 2. Add Current Message
    messages.push({
      role: 'user',
      content: this._formatContent(message, true)
    });

    // 3. Construct Payload
    return {
      messages: messages,
      system: [{ text: `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}` }],
      inferenceConfig: {
        maxTokens: options.maxTokens || this.defaultMaxTokens,
        temperature: options.temperature || 0.1,
        topP: options.topP || 0.9
      },
      toolConfig: options.tools ? {
        tools: options.tools.map(t => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: { json: t.input_schema }
          }
        }))
      } : undefined 
    };
  }

  /**
   * Builder: Payload for ANTHROPIC CLAUDE 3/3.5
   */
  _buildClaudePayload(message, conversationHistory, options) {
    // 1. Format History & Message
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content // Claude handles string or array automatically
      })),
      { role: 'user', content: message }
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
   * Builder: Payload for AMAZON TITAN (No Tool Support via API)
   */
  _buildTitanPayload(message, conversationHistory, options) {
    const historyText = conversationHistory.map(m => 
      `\n${m.role === 'user' ? 'User' : 'Bot'}: ${JSON.stringify(m.content)}`
    ).join('');

    const fullPrompt = `${SECURITY_SYSTEM_PROMPT}\n${options.systemPrompt || ''}\n${historyText}\nUser: ${message}\nBot:`;

    return {
      inputText: fullPrompt,
      textGenerationConfig: {
        maxTokenCount: options.maxTokens || this.defaultMaxTokens,
        stopSequences: ["User:"],
        temperature: options.temperature || 0.1,
      }
    };
  }

  /**
   * Master Payload Router
   */
  _buildPayload(message, conversationHistory, options) {
    if (this.isNovaModel(this.modelId)) return this._buildNovaPayload(message, conversationHistory, options);
    if (this.isClaudeModel(this.modelId)) return this._buildClaudePayload(message, conversationHistory, options);
    return this._buildTitanPayload(message, conversationHistory, options);
  }

  /**
   * Single Turn Chat
   * Sends a request to Bedrock and parses the response
   */
  async chat(message, conversationHistory = [], options = {}) {
    try {
      const requestBody = this._buildPayload(message, conversationHistory, options);
      
      console.log(`[Bedrock] Invoking ${this.modelId} (Input size: ${JSON.stringify(requestBody).length} chars)`);

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // --- PARSE RESPONSE ---
      let content = '';
      let toolUse = null;
      let stopReason = '';
      let inputTokens = 0;
      let outputTokens = 0;

      if (this.isNovaModel(this.modelId)) {
        // Nova Parsing
        const msgContent = responseBody.output?.message?.content || [];
        stopReason = responseBody.stopReason;
        inputTokens = responseBody.usage?.inputTokens || 0;
        outputTokens = responseBody.usage?.outputTokens || 0;

        // Nova returns an array of content blocks (text or toolUse)
        for (const block of msgContent) {
          if (block.text) {
            content += block.text;
          } else if (block.toolUse) {
            toolUse = {
              id: block.toolUse.toolUseId,
              name: block.toolUse.name,
              input: block.toolUse.input
            };
          }
        }
      } else if (this.isClaudeModel(this.modelId)) {
        // Claude Parsing
        stopReason = responseBody.stop_reason;
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;

        // Claude returns array of content blocks
        if (responseBody.content) {
            for (const block of responseBody.content) {
                if (block.type === 'text') {
                    content += block.text;
                } else if (block.type === 'tool_use') {
                    toolUse = {
                        id: block.id,
                        name: block.name,
                        input: block.input
                    };
                }
            }
        }
      } else {
        // Titan/Other Parsing
        content = responseBody.results[0]?.outputText || '';
        stopReason = responseBody.results[0]?.completionReason;
      }

      return {
        content,
        toolUse,
        stopReason,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens }
      };

    } catch (error) {
      console.error('[Bedrock] Error:', error);
      throw error;
    }
  }

  /**
   * Agentic Chat Loop
   * Handles multi-turn conversations where the model can execute tools,
   * get results, and continue reasoning.
   *
   * @param {string} userMessage - The initial user message
   * @param {Array} conversationHistory - Previous conversation history
   * @param {Object} options - Options including services, maxLoops, returnSteps
   * @returns {Object} - Final response with content, usage, and optionally steps
   */
  async agentChat(userMessage, conversationHistory = [], options = {}) {
    const { services, maxLoops = 10, returnSteps = false } = options;

    // Lazy load tools to avoid circular dependency
    let executeTool;
    try {
        executeTool = require('./tools').executeTool;
    } catch (e) {
        console.warn('[Agent] Could not load tools module:', e.message);
        return {
          content: "Error: Tool execution system is not available.",
          error: e.message
        };
    }

    // Clone history to avoid mutating the original array
    let currentHistory = [...conversationHistory];
    let currentInput = userMessage;

    // Track agent execution for transparency
    const executionSteps = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let loopCount = 0;

    console.log('[Agent] Starting agentic loop with max iterations:', maxLoops);

    while (loopCount < maxLoops) {
      loopCount++;
      console.log(`[Agent] === Iteration ${loopCount}/${maxLoops} ===`);

      // 1. Invoke the Model
      let response;
      try {
        response = await this.chat(currentInput, currentHistory, options);

        // Track token usage
        if (response.usage) {
          totalInputTokens += response.usage.input_tokens || 0;
          totalOutputTokens += response.usage.output_tokens || 0;
        }

        // Log response for debugging
        console.log(`[Agent] Stop Reason: ${response.stopReason}`);
        if (response.content) {
          console.log(`[Agent] Response: ${response.content.substring(0, 150)}...`);
        }

      } catch (error) {
        console.error('[Agent] Model invocation error:', error);
        return {
          content: `Error: Failed to get response from AI model: ${error.message}`,
          error: error.message,
          steps: returnSteps ? executionSteps : undefined,
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
        };
      }

      // 2. Check Stop Conditions

      // No tool use - we have a final answer
      if (!response.toolUse) {
        console.log('[Agent] No tool use detected. Returning final answer.');

        if (returnSteps) {
          executionSteps.push({
            iteration: loopCount,
            type: 'final_response',
            content: response.content,
            stopReason: response.stopReason
          });
        }

        return {
          content: response.content,
          stopReason: response.stopReason,
          steps: returnSteps ? executionSteps : undefined,
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
          iterations: loopCount
        };
      }

      // Check for stop_sequence or other terminal stop reasons
      if (response.stopReason === 'end_turn' || response.stopReason === 'stop_sequence') {
        console.log('[Agent] Terminal stop reason detected:', response.stopReason);
        return {
          content: response.content || "Task completed.",
          stopReason: response.stopReason,
          steps: returnSteps ? executionSteps : undefined,
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
          iterations: loopCount
        };
      }

      // 3. Handle Tool Use
      const toolName = response.toolUse.name;
      const toolInput = response.toolUse.input;

      console.log(`[Agent] Tool Requested: ${toolName}`);
      console.log(`[Agent] Tool Input:`, JSON.stringify(toolInput));

      // A. Append Assistant's Tool Use Request to History
      const assistantMsg = this._formatAssistantToolUseMessage(response);
      currentHistory.push(assistantMsg);

      // B. Execute the Tool
      let toolResultData;
      let toolExecutionError = false;

      try {
        console.log(`[Agent] Executing tool: ${toolName}...`);
        const startTime = Date.now();

        toolResultData = await executeTool(toolName, toolInput, services);

        const executionTime = Date.now() - startTime;
        console.log(`[Agent] Tool executed successfully in ${executionTime}ms`);
        console.log(`[Agent] Tool Output Preview:`, JSON.stringify(toolResultData).substring(0, 200) + "...");

      } catch (err) {
        console.error(`[Agent] Tool execution failed:`, err);
        toolExecutionError = true;
        toolResultData = {
          success: false,
          error: err.message,
          toolName: toolName
        };
      }

      // Track this step
      if (returnSteps) {
        executionSteps.push({
          iteration: loopCount,
          type: 'tool_use',
          toolName: toolName,
          toolInput: toolInput,
          toolResult: toolResultData,
          hasError: toolExecutionError,
          reasoning: response.content
        });
      }

      // C. Format Tool Result for Next Turn
      currentInput = this._formatToolResult(response.toolUse.id, toolResultData, toolExecutionError);

      // If tool execution failed critically, we might want to give model a chance to recover
      // but also be ready to exit if it can't
      if (toolExecutionError && loopCount >= maxLoops - 1) {
        console.warn('[Agent] Tool error near max loops. Forcing final iteration.');
      }
    }

    // Max loops reached
    console.warn('[Agent] Maximum loop iterations reached without final answer');
    return {
      content: "I apologize, but I've reached the maximum number of reasoning steps. Please try rephrasing your question or breaking it into smaller parts.",
      stopReason: 'max_loops',
      steps: returnSteps ? executionSteps : undefined,
      usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
      iterations: loopCount,
      warning: 'Maximum iterations reached'
    };
  }

  /**
   * Helper: Format assistant's tool use message based on model type
   */
  _formatAssistantToolUseMessage(response) {
    if (this.isNovaModel(this.modelId)) {
      // Nova Format
      return {
        role: 'assistant',
        content: [
          { text: response.content || "" },
          {
            toolUse: {
              toolUseId: response.toolUse.id,
              name: response.toolUse.name,
              input: response.toolUse.input
            }
          }
        ]
      };
    } else {
      // Claude Format
      return {
        role: 'assistant',
        content: [
          { type: 'text', text: response.content || "" },
          {
            type: 'tool_use',
            id: response.toolUse.id,
            name: response.toolUse.name,
            input: response.toolUse.input
          }
        ]
      };
    }
  }

  /**
   * Helper: Format tool result based on model type
   */
  _formatToolResult(toolUseId, toolResultData, isError = false) {
    if (this.isNovaModel(this.modelId)) {
      // Nova Tool Result Format
      return [{
        toolResult: {
          toolUseId: toolUseId,
          content: [{ json: toolResultData }],
          status: isError ? 'error' : 'success'
        }
      }];
    } else {
      // Claude Tool Result Format
      return [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify(toolResultData),
        is_error: isError
      }];
    }
  }

  // --- ANALYTIC HELPERS ---

  async analyze(prompt, text) {
    return await this.chat(text, [], {
      systemPrompt: prompt,
      temperature: 0.3,
      maxTokens: 2048,
    });
  }

  async analyzeConfig(cloudConfigJson) {
    const prompt = `Analyze this cloud configuration JSON for critical security vulnerabilities. JSON: ${JSON.stringify(cloudConfigJson)}`;
    return await this.chat(prompt, [], { temperature: 0 });
  }
}

module.exports = { BedrockService };