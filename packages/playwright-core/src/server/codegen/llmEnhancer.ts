/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import type * as actions from '@recorder/actions';
import { loadLLMConfig, type LLMConfig } from './llmConfig';

// Cache to ensure we don't process the same action multiple times
const processedActionCache = new Map<string, string>();

// Cache for complete scripts to avoid processing the same script multiple times
const processedScriptCache = new Map<string, string>();

// Load configuration
const llmConfig = loadLLMConfig();

// Helper function for logging that respects the debug flag
function debugLog(message: string) {
  if (llmConfig.debug) {
    process.stdout.write(`[LLM Debug] ${message}\n`);
  }
}

export async function enhanceWithLLM(
  generatedCode: string,
  action: actions.Action,
  actionContext: actions.ActionInContext
): Promise<string> {
  try {
    // Create a unique key for this action to avoid duplicate processing
    const actionKey = `${action.name}_${JSON.stringify(action)}_${actionContext.startTime}`;

    // Check if we've already processed this action
    if (processedActionCache.has(actionKey)) {
      debugLog(`Using cached result for action: ${action.name}`);
      return processedActionCache.get(actionKey)!;
    }

    process.stdout.write(`Enhancing code with LLM for action: ${action.name}\n`);
    debugLog(`Full action data: ${JSON.stringify(action, null, 2)}`);

    // Initialize the chat model with config settings
    const model = new ChatOllama({
      baseUrl: llmConfig.ollama.baseUrl,
      model: llmConfig.ollama.model,
      temperature: llmConfig.ollama.temperature,
      numPredict: llmConfig.ollama.numPredict
    });

    debugLog(`Using Ollama at ${llmConfig.ollama.baseUrl} with model ${llmConfig.ollama.model}`);

    // Extract element information if available - using optional chaining to avoid type errors
    const targetInfo = (action as any).targetInfo || {};
    const elementPaths = targetInfo.paths || {};

    // Prepare additional element context if available
    let elementContext = '';
    if (elementPaths.xpath || elementPaths.fullXPath || elementPaths.jsPath || elementPaths.outerHTML) {
      elementContext = `
Element Information:
- Element Tag: ${targetInfo.tagName || 'Unknown'}
- Element Classes: ${targetInfo.elementClasses || 'None'}
- Element Attributes: ${JSON.stringify(targetInfo.elementAttributes || {})}
- XPath: ${elementPaths.xpath || 'N/A'}
- Full XPath: ${elementPaths.fullXPath || 'N/A'}
- JS Path: ${elementPaths.jsPath || 'N/A'}
- OuterHTML: ${elementPaths.outerHTML || 'N/A'}
`;
    }

    // Prepare the context for the LLM
    const actionData = JSON.stringify(action, null, 2);
    const systemPrompt = llmConfig.prompts.systemPrompt;

    const userPrompt = `Here's a Playwright action in JSON format:
\`\`\`json
${actionData}
\`\`\`
${elementContext}
Here's the generated code for this action:
\`\`\`javascript
${generatedCode}
\`\`\`

Please enhance this code to make it more robust and maintainable while preserving its functionality. When appropriate, consider using the element paths information to create more reliable selectors or fallback mechanisms.`;

    debugLog('Sending prompt to LLM...');

    // Get response from the LLM
    const response = await model.call([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    let enhancedCode = response.content.toString();
    debugLog('Got response from LLM');

    // Extract code from markdown code blocks if present
    if (enhancedCode.includes('```')) {
      const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
      const match = enhancedCode.match(codeBlockRegex);
      if (match && match[1]) {
        enhancedCode = match[1].trim();
        debugLog('Extracted code from markdown code block');
      }
    }

    // Cache the result for future use
    processedActionCache.set(actionKey, enhancedCode);
    debugLog(`Cached result for action: ${action.name}`);

    return enhancedCode;
  } catch (error) {
    process.stderr.write(`Error enhancing code with LLM: ${error}\n`);
    debugLog(`Full error details: ${error && (error as Error).stack}`);
    // Fall back to original code if there's an error
    return generatedCode;
  }
}

// New function to enhance the complete test script when the page is closed
export async function enhanceCompleteScript(
  completeScript: string,
  actions: actions.ActionInContext[]
): Promise<string> {
  try {
    // Create a unique hash for this script to avoid duplicates
    const scriptHash = hashString(completeScript);

    // Check if we've already processed this script
    if (processedScriptCache.has(scriptHash)) {
      debugLog('Using cached result for complete script');
      return processedScriptCache.get(scriptHash)!;
    }

    process.stdout.write('Enhancing complete test script with LLM...\n');
    debugLog(`Complete script length: ${completeScript.length} characters`);

    // Initialize the chat model with config settings
    const model = new ChatOllama({
      baseUrl: llmConfig.ollama.baseUrl,
      model: llmConfig.ollama.model,
      temperature: llmConfig.ollama.completeScriptTemperature,
    });

    debugLog(`Using Ollama at ${llmConfig.ollama.baseUrl} with model ${llmConfig.ollama.model}`);

    // Prepare a specialized system prompt for the complete script analysis
    const systemPrompt = llmConfig.prompts.completeScriptSystemPrompt;

    const userPrompt = `Here is a complete Playwright test script that was auto-generated. Please analyze and improve it to make it more robust, maintainable, and reliable:

\`\`\`javascript
${completeScript}
\`\`\`

Please provide the complete enhanced test script.`;

    debugLog('Sending complete script to LLM...');

    // Get response from the LLM
    const response = await model.call([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    let enhancedScript = response.content.toString();
    debugLog('Got response from LLM for complete script');

    // Extract code from markdown code blocks if present
    if (enhancedScript.includes('```')) {
      const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
      const match = enhancedScript.match(codeBlockRegex);
      if (match && match[1]) {
        enhancedScript = match[1].trim();
        debugLog('Extracted code from markdown code block');
      }
    }

    // Cache the result
    processedScriptCache.set(scriptHash, enhancedScript);
    debugLog('Cached result for complete script');

    return enhancedScript;
  } catch (error) {
    process.stderr.write(`Error enhancing complete script with LLM: ${error}\n`);
    debugLog(`Full error details: ${error && (error as Error).stack}`);
    // Fall back to original script if there's an error
    return completeScript;
  }
}

// Helper function to create a simple hash of a string
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
} 