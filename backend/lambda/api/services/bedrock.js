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
   */
  async agentChat(userMessage, conversationHistory = [], options = {}) {
    const { services } = options;
    const MAX_LOOPS = 5;
    let loopCount = 0;
    
    // Lazy load tools to avoid circular dependency
    let executeTool;
    try {
        executeTool = require('./tools').executeTool;
    } catch (e) {
        console.warn('Could not load tools module automatically');
    }

    // Clone history to avoid mutating the original array passed by reference
    let currentHistory = [...conversationHistory];
    let currentInput = userMessage;

    console.log('--- Starting Agent Loop ---');

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      // 1. Invoke Model
      const response = await this.chat(currentInput, currentHistory, options);

      // 2. Check if we are done (No tool use)
      if (!response.toolUse) {
        return response; // Return final text answer
      }

      // 3. Handle Tool Use
      console.log(`[Agent] Tool Requested: ${response.toolUse.name}`);
      
      // A. Append Assistant's "Tool Use" Request to History
      if (this.isNovaModel(this.modelId)) {
        currentHistory.push({
          role: 'user', // Nova expects the 'turn' to be closed by user response? No, we need to log what assistant did.
          // Wait: For Nova/Claude, we must append the ASSISTANT's turn containing the tool_use
          // BEFORE we append the USER's turn containing the tool_result.
        });
        
        // Actually, simpler approach for loop: 
        // We need to persist the Assistant's message that *requested* the tool
        const assistantMsg = {
            role: 'assistant',
            content: [
                { text: response.content || "Thinking..." },
                { toolUse: { toolUseId: response.toolUse.id, name: response.toolUse.name, input: response.toolUse.input } }
            ]
        };
        currentHistory.push(assistantMsg);

      } else {
        // Claude Format
        const assistantMsg = {
            role: 'assistant',
            content: [
                { type: 'text', text: response.content || "Checking..." },
                { type: 'tool_use', id: response.toolUse.id, name: response.toolUse.name, input: response.toolUse.input }
            ]
        };
        currentHistory.push(assistantMsg);
      }

      // B. Execute the Tool
      let toolResultData;
      try {
        if (!executeTool) throw new Error("Tool execution module not found");
        
        const result = await executeTool(response.toolUse.name, response.toolUse.input, services);
        toolResultData = result;
      } catch (err) {
        toolResultData = { error: err.message };
      }

      console.log(`[Agent] Tool Output:`, JSON.stringify(toolResultData).substring(0, 100) + "...");

      // C. Format Tool Result for the next turn (This becomes the "User" input)
      if (this.isNovaModel(this.modelId)) {
        // Nova Tool Result Format
        currentInput = [
            {
                toolResult: {
                    toolUseId: response.toolUse.id,
                    content: [{ json: toolResultData }], // Nova expects 'json' or 'text' inside content
                    status: 'success'
                }
            }
        ];
      } else {
        // Claude Tool Result Format
        currentInput = [
            {
                type: 'tool_result',
                tool_use_id: response.toolUse.id,
                content: JSON.stringify(toolResultData)
            }
        ];
      }
      
      // Loop continues... the next `chat()` call will take `currentInput` (the tool result)
      // and append it to `currentHistory` (which now has the assistant tool request).
    }

    return { content: "Error: Maximum tool loop iterations reached." };
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