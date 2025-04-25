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


import { CodegenEnhancerOptions } from 'packages/playwright-core';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SystemMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';

import type * as actions from '@recorder/actions';

const DEBUG_LLM = process.env.PW_DEBUG_LLM === '1';
const processedActionCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();
const actionsTracker = new Map<string, { timestamp: number, actionContext: actions.ActionInContext }>();


export function getPendingRequests(): Map<string, Promise<string>> {
  return pendingRequests;
}

function debugLog(message: string) {
  if (DEBUG_LLM) {
    try {
      process.stdout.write(`[LLM Debug] ${message}\n`);
    } catch (error) {
      // Silently fail if writing to stdout fails
      // This prevents errors from propagating while still allowing the main functionality to work
    }
  }
}


export class CodegenEnhancer {

  actionEnhancer: BaseChatModel | undefined;
  actionPrompt: string | undefined;
  completeScriptEnhancer: BaseChatModel | undefined;
  scriptPrompt: string | undefined;

  action_systemPrompt?: string;
  previous_action: string | undefined = 'other';

  constructor(codegenEnhancerOptions: CodegenEnhancerOptions) {
    this.actionEnhancer = codegenEnhancerOptions.actionEnhancer;
    this.actionPrompt = codegenEnhancerOptions.actionPrompt;
    this.completeScriptEnhancer = codegenEnhancerOptions.completeScriptEnhancer;
    this.scriptPrompt = codegenEnhancerOptions.scriptPrompt;

    if (!this.actionEnhancer && !this.completeScriptEnhancer && !this.actionPrompt && !this.scriptPrompt)
      throw new Error('At least one enhancer must be provided');

    if ((this.actionEnhancer && !this.actionPrompt) || (!this.actionEnhancer && this.actionPrompt))
      throw new Error('ActionEnhancer and actionPrompt must be provided together');

    if ((this.completeScriptEnhancer && !this.scriptPrompt) || (!this.completeScriptEnhancer && this.scriptPrompt))
      throw new Error('CompleteScriptEnhancer and scriptPrompt must be provided together');

    if (this.actionEnhancer && this.actionPrompt) {
      this.action_systemPrompt = `You are a seasoned Playwright test automation expert. Your task is to transform individual action instructions into robust, production-ready JavaScript code. Each action will be provided sequentially, with action data, element context, and the generated code for the action. Your task is to impove the generated code for that action. All the code that you give sequentially will be merged to generate the final test script. Follow these guidelines precisely:
      **IMPORTANT**
      - Output only the improved Playwright code without any extra text. 
      ${this.actionPrompt}`;
    }

  }

  async waitForPendingRequests(): Promise<void> {
    if (pendingRequests.size === 0)
      return;

    debugLog('Waiting for all pending enhancement requests to complete...');
    const promises = Array.from(pendingRequests.values());
    await Promise.all(promises);
    debugLog('All pending enhancement requests completed');
  }

  private updateActionModified(action_modified: actions.Action | actions.FillAction): string {
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

        if (Object.keys(targetInfoCopy.paths).length === 0)
          delete targetInfoCopy.paths;
      }

      if (Object.keys(targetInfoCopy).length === 0)
        delete (action_modified as any).targetInfo;
      else
        (action_modified as any).targetInfo = targetInfoCopy;
    }

    return JSON.stringify(action_modified, null, 2);

  }

  private userPromptForAction(action_modified: actions.Action | actions.FillAction, generatedCode: string): string {
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
    }

    const actionData = this.updateActionModified(action_modified);
    return `Here's one Playwright action in JSON format:

\`\`\`json
${actionData}
\`\`\`
${elementContext}
Here's the generated code for this action:
\`\`\`javascript
${generatedCode}
\`\`\`
`;
  }

  async enhanceActionWithLLM(
    generatedCode: string,
    action: actions.Action,
    actionContext: actions.ActionInContext
  ): Promise<string> {
    try {
      const startTime = Date.now();

      if (!this.action_systemPrompt)
        return generatedCode;

      const requestId = Math.random().toString(36).substring(2, 10);
      const actionKey = `${action.name}_${actionContext.startTime}`;

      if (processedActionCache.has(actionKey))
        return processedActionCache.get(actionKey)!;

      if (pendingRequests.has(actionKey))
        return pendingRequests.get(actionKey)!;

      if (action.name === 'fill'){
        const framePath = actionContext.frame.framePath.join('_');
        const elementKey = `${action.name}_${framePath}_${action.selector}`;
        actionsTracker.set(elementKey, {
          timestamp: Date.now(),
          actionContext
        });
        return generatedCode;
      }

      if (actionsTracker.size > 0){
        debugLog(`[Performance][${requestId}] Processing ${actionsTracker.size} pending actions after action`);
        let entry: { timestamp: number, actionContext: actions.ActionInContext } | undefined;
        let elementKey: string | undefined;
        let maxTimestamp = 0;
        actionsTracker.forEach((entry_, key) => {
          if (entry_.timestamp > maxTimestamp) {
            maxTimestamp = entry_.timestamp;
            entry = entry_;
            elementKey = key;
          }
        });
        if (!entry || !elementKey)
          return generatedCode;
        const action = entry.actionContext.action as actions.Action;
        try {
          await this.processActionIfLast(elementKey, action, generatedCode, requestId, startTime);
        } catch (error) {
          debugLog(`[Performance][${requestId}] Error processing action: ${error}`);
        } finally {
          actionsTracker.clear();
        }
      }

      const action_modified = action;
      if ('position' in action_modified)
        delete action_modified['position'];

      const performLLMRequest = async () => {

        if (!this.action_systemPrompt)
          return generatedCode;

        try {
          const userPrompt = this.userPromptForAction(action_modified, generatedCode);
          debugLog(`Sending complete script to LLM...`);

          debugLog(`[CodegenEnhancer][${requestId}] Sending request to LLM`);
          const response = await this.actionEnhancer!.invoke([
            new SystemMessage(this.action_systemPrompt),
            new HumanMessage(userPrompt)
          ]);
          debugLog(`[CodegenEnhancer][${requestId}] Received LLM response`);

          let enhancedCode = response.content.toString();

          if (enhancedCode.includes('```')) {
            const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
            const match = enhancedCode.match(codeBlockRegex);
            if (match && match[1])
              enhancedCode = match[1].trim();
          }

          // Ensure there's exactly one empty line at the end
          enhancedCode = enhancedCode.trimEnd() + '\n\n';

          processedActionCache.set(actionKey, enhancedCode);
          pendingRequests.delete(actionKey);

          return enhancedCode;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          debugLog(`[CodegenEnhancer][${requestId}] LLM request failed: ${errorMessage}`);
          throw err;
        }
      };

      const requestPromise = performLLMRequest();
      pendingRequests.set(actionKey, requestPromise);

      return requestPromise;
    } catch (error) {

      pendingRequests.delete(`${action.name}_${actionContext.startTime}`);

      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`[CodegenEnhancer] Error enhancing action ${action.name}: ${errorMessage}`);

      return generatedCode;
    }
  }

  async enhanceCompleteScript(
    completeScript: string,
  ): Promise<string> {
    try {
      // First ensure all pending requests are completed
      await this.waitForPendingRequests();

      if (!this.completeScriptEnhancer || !this.scriptPrompt)
        return completeScript;

      debugLog(`Complete script length: ${completeScript.length} characters`);

      // Improved system prompt with stronger preservation instructions
      const systemPrompt = `You are an expert Playwright test automation engineer improving a generated test script. each of the actions in the script is already enhanced by an LLM. Your job is to improve the script as a whole.
  
CRITICAL REQUIREMENTS (HIGHEST PRIORITY):
1. NEVER remove ANY existing functionality from the script.
2. NEVER remove or modify fallback locators - they are essential for test reliability.
3. NEVER combine or merge different fallback locator mechanisms.
4. ALWAYS preserve ALL retry logic, waits, assertions, and error handling.
5. DO NOT change the structure or flow of the test.

  ${this.scriptPrompt}
  
  The script already has good structure. Your task is MINIMAL refinement while strictly preserving ALL functionality.

DO NOT add comments, explanations, or any text outside the JavaScript code.
Output ONLY the improved code, preserving EVERY SINGLE existing functionality.`;

      const userPrompt = `Here is a complete Playwright test script that was auto-generated. Please improve it while STRICTLY PRESERVING ALL EXISTING FUNCTIONALITY:

  \`\`\`javascript
  ${completeScript}
  \`\`\`

  Return ONLY the complete enhanced test script with ALL functionality preserved.`;

      // debugLog('Sending complete script to LLM...');

      // Get response from the LLM
      const response = await this.completeScriptEnhancer!.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ]);

      let enhancedScript = response.content.toString();
      debugLog('Got response from LLM for complete script');

      // Extract code from markdown code blocks if present
      if (enhancedScript.includes('```')) {
        const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
        const match = enhancedScript.match(codeBlockRegex);
        if (match && match[1])
          enhancedScript = match[1].trim();
      }

      // Ensure there's exactly one empty line at the end
      enhancedScript = enhancedScript.trimEnd() + '\n';

      return enhancedScript;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`Error enhancing complete script: ${errorMessage}`);
      // Fall back to original script if there's an error
      return completeScript;
    }
  }

  private async processActionIfLast(
    elementKey: string,
    action: actions.Action,
    generatedCode: string,
    requestId: string,
    startTime: number
  ) {
    const entry = actionsTracker.get(elementKey);
    if (!entry)
      return ;

    const actionContext = entry.actionContext;
    const actionKey = `${action.name}_${actionContext.startTime}`;

    if (!processedActionCache.has(actionKey) && !pendingRequests.has(actionKey)) {
      debugLog(`[Performance][${requestId}] Processing ${action.name} action for element: ${(action as any).selector}`);

      try {
        const actionToProcess = action;
        const requestPromise = (async () => {

          if (!this.action_systemPrompt || !this.actionEnhancer)
            return generatedCode;

          debugLog(`[Performance] Initializing model for ${action.name} action (${Date.now() - startTime}ms)`);

          const action_modified = actionToProcess;
          if ('position' in action_modified)
            delete action_modified['position'];

          const userPrompt = this.userPromptForAction(action_modified, generatedCode);

          const llmStartTime = Date.now();

          debugLog('Sending complete script to LLM...');

          const response = await this.actionEnhancer.invoke([
            new SystemMessage(this.action_systemPrompt),
            new HumanMessage(userPrompt)
          ]);

          debugLog(`[Performance][${requestId}] Received LLM response for ${action.name} action (${Date.now() - llmStartTime}ms)`);

          let enhancedCode = response.content.toString();

          if (enhancedCode.includes('```')) {
            const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)```/;
            const match = enhancedCode.match(codeBlockRegex);
            if (match && match[1])
              enhancedCode = match[1].trim();
          }

          // Ensure there's exactly one empty line at the end
          enhancedCode = enhancedCode.trimEnd() + '\n\n';

          processedActionCache.set(actionKey, enhancedCode);
          debugLog(`[Performance] Cached result for ${action.name} action (${Date.now() - startTime}ms)`);

          pendingRequests.delete(actionKey);
          actionsTracker.delete(elementKey);

          return enhancedCode;
        })();

        pendingRequests.set(actionKey, requestPromise);
        return requestPromise;
      } catch (error) {
        process.stderr.write(`Error enhancing ${action.name} action with LLM: ${error}\n`);
        pendingRequests.delete(actionKey);
        actionsTracker.delete(elementKey);
      }
    }

    return generatedCode;
  }
}
