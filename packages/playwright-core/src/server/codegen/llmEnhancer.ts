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

// Cache to ensure we don't process the same action multiple times
const processedActionCache = new Map<string, string>();

// LLM configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const DEBUG_LLM = process.env.PW_DEBUG_LLM === '1';

// Helper function for logging that respects the debug flag
export function debugLog(message: string) {
  if (DEBUG_LLM)
    process.stdout.write(`[LLM Debug] ${message}\n`);
}

function randomWord() {
  return [...Array(4)].map(() => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join('');
}

export async function enhanceWithLLM(
  generatedCode: string,
  action: actions.Action,
  actionContext: actions.ActionInContext
): Promise<string> {
  const startTime = Date.now();
  try {
    const requestId = Math.random().toString(36).substring(2, 10);

    const actionKey = `${action.name}_${actionContext.startTime}`;

    // Check if we've already processed this action
    if (processedActionCache.has(actionKey)) {
      debugLog(`[Performance] Using cached result for action: ${action.name} (${Date.now() - startTime}ms)`);
      return processedActionCache.get(actionKey)!;
    }

    // Create a unique key for this action to avoid duplicate processing
    debugLog(`[Performance][${requestId}] Starting LLM enhancement for action: ${action.name}`);

    // Removing position if present
    let action_modified = action;
    if ('position' in action_modified) delete action_modified['position'];

    debugLog(`[Performance] Initializing Ollama model (${Date.now() - startTime}ms)`);
    // Initialize the chat model
    const model = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      temperature: 0.7,
      numPredict: 500
    });

    debugLog(`[Performance] Preparing element context (${Date.now() - startTime}ms)`);
    // Extract element information if available - using optional chaining to avoid type errors
    const targetInfo = (action_modified as any).targetInfo || {};
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

      // Remove data from action_modified that's already in elementContext
      if ((action_modified as any).targetInfo) {
        const targetInfoCopy = { ...(action_modified as any).targetInfo };
        delete targetInfoCopy.tagName;
        delete targetInfoCopy.elementClasses;
        delete targetInfoCopy.elementAttributes;
        if (targetInfoCopy.paths) {
          delete targetInfoCopy.paths.xpath;
          delete targetInfoCopy.paths.fullXPath;
          delete targetInfoCopy.paths.jsPath;
          delete targetInfoCopy.paths.outerHTML;

          // If paths object is now empty, remove it
          if (Object.keys(targetInfoCopy.paths).length === 0) {
            delete targetInfoCopy.paths;
          }
        }

        // If targetInfo is now empty, remove it entirely
        if (Object.keys(targetInfoCopy).length === 0) {
          delete (action_modified as any).targetInfo;
        } else {
          (action_modified as any).targetInfo = targetInfoCopy;
        }
      }
    }

    debugLog(`[Performance] Preparing prompts (${Date.now() - startTime}ms)`);
    // Convert action to string before modifying it for element context
    const actionData = JSON.stringify(action_modified, null, 2);

    process.stdout.write(`Enhancing code with LLM for action: ${action.name}\n`);

    // Prepare the context for the LLM
    const systemPrompt = `You are a seasoned Playwright test automation expert. Your task is to transform individual action instructions into robust, production-ready JavaScript code. Each action will be provided sequentially, and your output for each should be modular, clean, and mergeable into a complete test suite. Follow these guidelines precisely:

1. **Coordinate Avoidance**
   - ❌ Do not use absolute coordinates (e.g., 'locator.click({ position: { x: 167, y: 22 } })').

2. **Avoid Dynamic Values**
   - Do not use dynamic values such as numeric IDs or changing XPath fragments (e.g., avoid using 'id="__037EA11827UYMTVTDC1AMMWI"').

3. **Fallback Locators**
   - Always include at least 1 fallback locator. which should be different than primary
   - Implement retry logic for fallback locators if the primary fails within 2 minutes.

4. **Utilize outerHTML Content**
   - Use 'outerHTML' to enhance locators by identifying reliable attributes or DOM paths.

5. **Unique Variable Naming**
   - make unique variable names by appending random characters to avoid redeclaration during code merging. In the action i will provide a 3 random_word use any of them when declaring variables. 
      e.g., if varible name is 'searchBox' and random_word is '32n2' so make variable name searchBox_32n2,
      if varible name is 'userField' and random_word is '234c' so make variable name userField_234c

6. **Modularity and Maintainability**
   - ❌ Never use targetInfo in the give code eg. locator.click({ targetInfo: { elementClasses: 'loginInputField'} }) - Don't do this;

7. **Ignore Lightbox Close Actions**
   - For actions involving lightbox close, return an empty step (no code output).

8. **Output Requirement**
   - Output only the improved Playwright code without any extra text.`;

    const userPrompt = `Here's one Playwright action in JSON format:
\`\`\`json
${actionData}
\`\`\`
${elementContext}
Here's the generated code for this action:
\`\`\`javascript
${generatedCode}
\`\`\`
random_word - ${randomWord()}, ${randomWord()}, ${randomWord()}
`;

    debugLog(`[Performance][${requestId}] Sending request to LLM (${Date.now() - startTime}ms)`);

    // Get response from the LLM
    const llmStartTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
    debugLog(`[Performance][${requestId}] Received LLM response (${Date.now() - llmStartTime}ms)`);

    let enhancedCode = response.content.toString();
    debugLog(`[Performance] Processing LLM response (${Date.now() - startTime}ms)`);

    // Extract code from markdown code blocks if present
    if (enhancedCode.includes('```')) {
      const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
      const match = enhancedCode.match(codeBlockRegex);
      if (match && match[1]) {
        enhancedCode = match[1].trim();
        debugLog(`[Performance] Extracted code from markdown (${Date.now() - startTime}ms)`);
      }
    }

    // Cache the result for future use
    processedActionCache.set(actionKey, enhancedCode);
    debugLog(`[Performance] Cached result for action: ${action.name} (${Date.now() - startTime}ms)`);

    return enhancedCode;
  } catch (error) {
    process.stderr.write(`Error enhancing code with LLM: ${error}\n`);
    debugLog(`[Performance] Error occurred after ${Date.now() - startTime}ms`);
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

    process.stdout.write('Enhancing complete test script with LLM...\n');
    debugLog(`Complete script length: ${completeScript.length} characters`);

    // Initialize the chat model
    const model = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
    });

    debugLog(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);

    // Prepare a specialized system prompt for the complete script analysis
    const systemPrompt = `You are an expert Playwright test automation engineer. You need to optimize and improve a full Playwright test script.

    IMPORTANT - Ensure that the same variables are not declared multiple times. If they are take care of that error. 

Focus on these aspects for the complete test:
1. Ensure that where-ever the user has entered a text it becomes a variable and is declared at the top of the code so it can easily be changed.
2. Anytime user extracts a text and the same text is entered later store the extracted text and use the variable to enter the text.
3. Make sure the script does not contain any error. 
4. Make the code easity configurable.
5. More maintainable code structure
6. Preserve the existing functionality but make it more robust.
7. Organize the test into logical sections
8. Add proper setup and teardown if missing
9. Implement better wait strategies and timeouts where needed
10. Optimize selectors for better test reliability
11. Refactor repeated code patterns into reusable functions
12. Ensure the test follows best practices for Playwright automation


Return the complete improved test script. Do not include explanations, just the improved code.`;

    const userPrompt = `Here is a complete Playwright test script that was auto-generated. Please analyze and improve it to make it more robust, maintainable, and reliable:

\`\`\`javascript
${completeScript}
\`\`\`

Please provide the complete enhanced test script.`;

    debugLog('Sending complete script to LLM...');

    // Get response from the LLM
    const response = await model.invoke([
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
