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

// import { ChatOllama } from 'langchain/chat_models/ollama';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// import { HumanMessage, SystemMessage } from 'langchain/schema';

import type * as actions from '@recorder/actions';

// Cache to ensure we don't process the same action multiple times
const processedActionCache = new Map<string, string>();

// Cache for complete scripts to avoid processing the same script multiple times
const processedScriptCache = new Map<string, string>();

// LLM configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const DEBUG_LLM = process.env.PW_DEBUG_LLM === '1';

// Helper function for logging that respects the debug flag
function debugLog(message: string) {
  if (DEBUG_LLM) {
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
    
    // Initialize the chat model
    const model = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      temperature: 0.7,
    });
    
    debugLog(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);

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
    const systemPrompt = `You are an expert Playwright test developer. Your task is to enhance the generated test code with better comments, error handling, assertions, or any improvements that make the test more robust and maintainable.
    
Focus on these aspects:
1. Better descriptive comments about the element interactions
2. Improved error handling where appropriate
3. Additional assertions that verify the expected state
4. More maintainable code structure
5. Preserve the existing functionality but make it more robust
6. Use the provided element information (XPath, JS Path, etc.) to create more robust selectors or fallback selectors when appropriate

Just return the improved code without explanations.`;

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
    
    // Initialize the chat model
    const model = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      temperature: 0.7,
    });
    
    debugLog(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);

    // Prepare a specialized system prompt for the complete script analysis
    const systemPrompt = `You are an expert Playwright test automation engineer. You need to optimize and improve a full Playwright test script.

Focus on these aspects for the complete test:
1. Organize the test into logical sections with appropriate comments
2. Add proper setup and teardown if missing
3. Implement better wait strategies and timeouts where needed
4. Add meaningful assertions to verify test success
5. Implement error handling and recovery mechanisms
6. Optimize selectors for better test reliability
7. Refactor repeated code patterns into reusable functions
8. Add logging to help with debugging
9. Ensure the test follows best practices for Playwright automation

Return the complete improved test script. Do not include explanations, just the improved code.`;

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