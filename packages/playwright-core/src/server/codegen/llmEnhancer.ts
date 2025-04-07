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
// Track ongoing requests to avoid duplicate calls
const pendingRequests = new Map<string, Promise<string>>();
// Track fill actions for same element to avoid processing interim keystroke actions
const fillActionsTracker = new Map<string, { timestamp: number, actionContext: actions.ActionInContext }>();
// Track press actions for same element to avoid processing interim keystroke actions
const pressActionsTracker = new Map<string, { timestamp: number, actionContext: actions.ActionInContext }>();

// LLM configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const DEBUG_LLM = process.env.PW_DEBUG_LLM === '1';
// Time threshold for combining fill actions (milliseconds)
const FILL_ACTION_THRESHOLD = parseInt(process.env.FILL_ACTION_THRESHOLD || '4000', 10); // 4 seconds
// Time threshold for combining press actions (milliseconds)
const PRESS_ACTION_THRESHOLD = parseInt(process.env.PRESS_ACTION_THRESHOLD || '2000', 10); // 2 seconds

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

    // Special handling for fill actions to avoid processing every keystroke
    if (action.name === 'fill') {
      const fillAction = action as actions.FillAction;
      // Create a unique key for the element based on selector and frame path
      const framePath = actionContext.frame.framePath.join('_');
      const elementKey = `fill_${framePath}_${fillAction.selector}`;
      
      // Store this fill action
      fillActionsTracker.set(elementKey, { 
        timestamp: Date.now(),
        actionContext
      });
      
      // For fill actions, we'll return the original code immediately
      // but set up a delayed check to see if this was the last fill action
      setTimeout(() => {
        processFillActionIfLast(elementKey, fillAction, generatedCode, requestId, startTime);
      }, FILL_ACTION_THRESHOLD);
      
      // Return the original code for now
      return generatedCode;
    }

    // Special handling for press actions to avoid processing every keystroke
    if (action.name === 'press') {
      const pressAction = action as actions.PressAction;
      // Create a unique key for the element based on selector and frame path
      const framePath = actionContext.frame.framePath.join('_');
      const elementKey = `press_${framePath}_${pressAction.selector}`;
      
      // Store this press action
      pressActionsTracker.set(elementKey, { 
        timestamp: Date.now(),
        actionContext
      });
      
      // For press actions, we'll return the original code immediately
      // but set up a delayed check to see if this was the last press action
      setTimeout(() => {
        processPressActionIfLast(elementKey, pressAction, generatedCode, requestId, startTime);
      }, PRESS_ACTION_THRESHOLD);
      
      // Return the original code for now
      return generatedCode;
    }

    // Check if we've already processed this action
    if (processedActionCache.has(actionKey)) {
      debugLog(`[Performance] Using cached result for action: ${action.name} (${Date.now() - startTime}ms)`);
      return processedActionCache.get(actionKey)!;
    }

    // Check if there's already a pending request for this action
    if (pendingRequests.has(actionKey)) {
      debugLog(`[Performance] Reusing pending request for action: ${action.name} (${Date.now() - startTime}ms)`);
      return pendingRequests.get(actionKey)!;
    }

    // Create a unique key for this action to avoid duplicate processing
    debugLog(`[Performance][${requestId}] Starting LLM enhancement for action: ${action.name}`);

    // Removing position if present
    let action_modified = action;
    if ('position' in action_modified) delete action_modified['position'];

    // Create a function to perform the actual LLM request and processing
    const performLLMRequest = async () => {
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
      // Remove from pending requests once completed
      pendingRequests.delete(actionKey);
      
      debugLog(`[Performance] Cached result for action: ${action.name} (${Date.now() - startTime}ms)`);

      return enhancedCode;
    };

    // Store this promise in the pendingRequests map
    const requestPromise = performLLMRequest();
    pendingRequests.set(actionKey, requestPromise);
    
    return requestPromise;
  } catch (error) {
    process.stderr.write(`Error enhancing code with LLM: ${error}\n`);
    debugLog(`[Performance] Error occurred after ${Date.now() - startTime}ms`);
    debugLog(`Full error details: ${error && (error as Error).stack}`);
    
    // Make sure to clean up the pending request on error
    const actionKey = `${action.name}_${actionContext.startTime}`;
    pendingRequests.delete(actionKey);
    
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
    process.stdout.write(completeScript);

    // Initialize the chat model with more conservative parameters
    const model = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      temperature: 0.2, // Lower temperature for more deterministic output
      numPredict: 2000, // Increase token limit for complete scripts
    });

    debugLog(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);

    // Improved system prompt with stronger preservation instructions
    const systemPrompt = `You are an expert Playwright test automation engineer improving a generated test script. 

CRITICAL REQUIREMENTS (HIGHEST PRIORITY):
1. NEVER remove ANY existing functionality from the script.
2. NEVER remove or modify fallback locators - they are essential for test reliability.
3. NEVER combine or merge different fallback locator mechanisms.
4. ALWAYS preserve ALL retry logic, waits, assertions, and error handling.
5. DO NOT change the structure or flow of the test.

You may ONLY make these specific improvements:
1. Extract hardcoded text inputs into variables declared at the top of the script.
2. When text is extracted and later entered elsewhere, store it in a variable.
3. Fix any syntax errors or variable redeclarations.
4. Improve variable naming for clarity.

The script already has good structure. Your task is MINIMAL refinement while strictly preserving ALL functionality.

DO NOT add comments, explanations, or any text outside the JavaScript code.
Output ONLY the improved code, preserving EVERY SINGLE existing functionality.`;

    const userPrompt = `Here is a complete Playwright test script that was auto-generated. Please improve it while STRICTLY PRESERVING ALL EXISTING FUNCTIONALITY:

\`\`\`javascript
${completeScript}
\`\`\`

Return ONLY the complete enhanced test script with ALL functionality preserved.`;

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

    // Safety check to ensure the enhanced script contains key Playwright operations
    // If key operations are missing that were in the original, return the original
    const originalOperations = countPlaywrightOperations(completeScript);
    const enhancedOperations = countPlaywrightOperations(enhancedScript);
    
    // If significant operations are missing, fall back to original
    if (enhancedOperations.clicks < originalOperations.clicks * 0.9 ||
        enhancedOperations.fills < originalOperations.fills * 0.9 ||
        enhancedOperations.navigations < originalOperations.navigations * 0.9) {
      debugLog('Warning: Enhanced script appears to be missing key operations. Falling back to original script.');
      return completeScript;
    }

    return enhancedScript;
  } catch (error) {
    process.stderr.write(`Error enhancing complete script with LLM: ${error}\n`);
    debugLog(`Full error details: ${error && (error as Error).stack}`);
    // Fall back to original script if there's an error
    return completeScript;
  }
}

// Helper function to count key Playwright operations in a script
function countPlaywrightOperations(script: string): {clicks: number, fills: number, navigations: number} {
  return {
    clicks: (script.match(/\.click\(/g) || []).length,
    fills: (script.match(/\.fill\(/g) || []).length,
    navigations: (script.match(/\.goto\(/g) || []).length
  };
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

/**
 * Process a fill action only if it's the last one in a sequence for the same element
 */
async function processFillActionIfLast(
  elementKey: string, 
  fillAction: actions.FillAction, 
  generatedCode: string,
  requestId: string,
  startTime: number
) {
  const entry = fillActionsTracker.get(elementKey);
  if (!entry) return;
  
  // Check if this is still the most recent fill action for this element
  const now = Date.now();
  if (now - entry.timestamp >= FILL_ACTION_THRESHOLD) {
    // This was the last fill action in the sequence
    const actionContext = entry.actionContext;
    const actionKey = `fill_complete_${actionContext.startTime}`;

    // Only proceed if we haven't already processed this complete fill action
    if (!processedActionCache.has(actionKey) && !pendingRequests.has(actionKey)) {
      debugLog(`[Performance][${requestId}] Processing completed fill action for element: ${fillAction.selector}`);
      
      try {
        // Create a modified action copy to ensure we're enhancing the complete fill action
        const actionToProcess = { 
          ...fillAction,
          name: 'fill_complete' // Mark as a complete fill to distinguish it
        };
        
        // Create the request promise
        const requestPromise = (async () => {
          debugLog(`[Performance] Initializing Ollama model for fill action (${Date.now() - startTime}ms)`);
          
          const model = new ChatOllama({
            baseUrl: OLLAMA_BASE_URL,
            model: OLLAMA_MODEL,
            temperature: 0.7,
            numPredict: 500
          });
          
          // Rest of processing like in enhanceWithLLM
          let action_modified = actionToProcess;
          if ('position' in action_modified) delete action_modified['position'];
          
          // Extract element information
          const targetInfo = (action_modified as any).targetInfo || {};
          const elementPaths = targetInfo.paths || {};
          
          // Prepare element context
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
          
          const actionData = JSON.stringify(action_modified, null, 2);
          process.stdout.write(`Enhancing code with LLM for completed fill action: ${fillAction.selector}\n`);
          
          // Same prompts as in the main function
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
          
          debugLog(`[Performance][${requestId}] Sending fill action request to LLM (${Date.now() - startTime}ms)`);
          
          const llmStartTime = Date.now();
          const response = await model.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt)
          ]);
          
          debugLog(`[Performance][${requestId}] Received LLM response for fill action (${Date.now() - llmStartTime}ms)`);
          
          let enhancedCode = response.content.toString();
          
          // Extract code from markdown code blocks if present
          if (enhancedCode.includes('```')) {
            const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
            const match = enhancedCode.match(codeBlockRegex);
            if (match && match[1]) {
              enhancedCode = match[1].trim();
            }
          }
          
          // Cache the result for future use with the complete fill key
          processedActionCache.set(actionKey, enhancedCode);
          debugLog(`[Performance] Cached result for completed fill action (${Date.now() - startTime}ms)`);
          
          // Clean up
          pendingRequests.delete(actionKey);
          fillActionsTracker.delete(elementKey);
          
          return enhancedCode;
        })();
        
        // Store the promise in pending requests
        pendingRequests.set(actionKey, requestPromise);
        
        // The result will be used in future generations
        await requestPromise;
      } catch (error) {
        process.stderr.write(`Error enhancing fill action with LLM: ${error}\n`);
        // Clean up on error
        pendingRequests.delete(`fill_complete_${actionContext.startTime}`);
        fillActionsTracker.delete(elementKey);
      }
    }
  }
}

/**
 * Process a press action only if it's the last one in a sequence for the same element
 */
async function processPressActionIfLast(
  elementKey: string, 
  pressAction: actions.PressAction, 
  generatedCode: string,
  requestId: string,
  startTime: number
) {
  const entry = pressActionsTracker.get(elementKey);
  if (!entry) return;
  
  // Check if this is still the most recent press action for this element
  const now = Date.now();
  if (now - entry.timestamp >= PRESS_ACTION_THRESHOLD) {
    // This was the last press action in the sequence
    const actionContext = entry.actionContext;
    const actionKey = `press_complete_${actionContext.startTime}`;

    // Only proceed if we haven't already processed this complete press action
    if (!processedActionCache.has(actionKey) && !pendingRequests.has(actionKey)) {
      debugLog(`[Performance][${requestId}] Processing completed press action for element: ${pressAction.selector}`);
      
      try {
        // Create a modified action copy to ensure we're enhancing the complete press action
        const actionToProcess = { 
          ...pressAction,
          name: 'press_complete' // Mark as a complete press to distinguish it
        };
        
        // Create the request promise
        const requestPromise = (async () => {
          debugLog(`[Performance] Initializing Ollama model for press action (${Date.now() - startTime}ms)`);
          
          const model = new ChatOllama({
            baseUrl: OLLAMA_BASE_URL,
            model: OLLAMA_MODEL,
            temperature: 0.7,
            numPredict: 500
          });
          
          // Rest of processing like in enhanceWithLLM
          let action_modified = actionToProcess;
          if ('position' in action_modified) delete action_modified['position'];
          
          // Extract element information
          const targetInfo = (action_modified as any).targetInfo || {};
          const elementPaths = targetInfo.paths || {};
          
          // Prepare element context
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
          
          const actionData = JSON.stringify(action_modified, null, 2);
          process.stdout.write(`Enhancing code with LLM for completed press action: ${pressAction.selector}\n`);
          
          // Same prompts as in the main function
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
          
          debugLog(`[Performance][${requestId}] Sending press action request to LLM (${Date.now() - startTime}ms)`);
          
          const llmStartTime = Date.now();
          const response = await model.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt)
          ]);
          
          debugLog(`[Performance][${requestId}] Received LLM response for press action (${Date.now() - llmStartTime}ms)`);
          
          let enhancedCode = response.content.toString();
          
          // Extract code from markdown code blocks if present
          if (enhancedCode.includes('```')) {
            const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
            const match = enhancedCode.match(codeBlockRegex);
            if (match && match[1]) {
              enhancedCode = match[1].trim();
            }
          }
          
          // Cache the result for future use with the complete press key
          processedActionCache.set(actionKey, enhancedCode);
          debugLog(`[Performance] Cached result for completed press action (${Date.now() - startTime}ms)`);
          
          // Clean up
          pendingRequests.delete(actionKey);
          pressActionsTracker.delete(elementKey);
          
          return enhancedCode;
        })();
        
        // Store the promise in pending requests
        pendingRequests.set(actionKey, requestPromise);
        
        // The result will be used in future generations
        await requestPromise;
      } catch (error) {
        process.stderr.write(`Error enhancing press action with LLM: ${error}\n`);
        // Clean up on error
        pendingRequests.delete(`press_complete_${actionContext.startTime}`);
        pressActionsTracker.delete(elementKey);
      }
    }
  }
}
