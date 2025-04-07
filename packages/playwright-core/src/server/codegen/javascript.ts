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

import { sanitizeDeviceOptions, toClickOptionsForSourceCode, toKeyboardModifiers, toSignalMap } from './language';
import { asLocator, escapeWithQuotes } from '../../utils';
import { deviceDescriptors } from '../deviceDescriptors';
import { enhanceWithLLM, debugLog } from './llmEnhancer';

import type { Language, LanguageGenerator, LanguageGeneratorOptions } from './types';
import type { BrowserContextOptions } from '../../../types/types';
import type * as actions from '@recorder/actions';

export class JavaScriptLanguageGenerator implements LanguageGenerator {
  id: string;
  groupName = 'Node.js';
  name: string;
  highlighter = 'javascript' as Language;
  private _isTest: boolean;
  private _useEnhancer: boolean;

  constructor(isTest: boolean) {
    this.id = isTest ? 'playwright-test' : 'javascript';
    this.name = isTest ? 'Test' : 'Library';
    this._isTest = isTest;
    this._useEnhancer = process.env.PW_USE_LLM_ENHANCER === '1';
    // console.log(process.env.PW_USE_LLM_ENHANCER);
    // console.log(this._useEnhancer);
  }

  async generateAction(actionInContext: actions.ActionInContext): Promise<string> {
    const startTime = Date.now();
    const action = actionInContext.action;
    if (this._isTest && (action.name === 'openPage' || action.name === 'closePage'))
      return '';

    const pageAlias = actionInContext.frame.pageAlias;
    const formatter = new JavaScriptFormatter(2);

    if (action.name === 'openPage') {
      formatter.add(`const ${pageAlias} = await context.newPage();`);
      if (action.url && action.url !== 'about:blank' && action.url !== 'chrome://newtab/')
        formatter.add(`await ${pageAlias}.goto(${quote(action.url)});`);
      return formatter.format();
    }

    debugLog(`[javascript] Starting code generation for action: ${action.name} (${Date.now() - startTime}ms)`);
    const locators = actionInContext.frame.framePath.map(selector => `.${this._asLocator(selector)}.contentFrame()`);
    const subject = `${pageAlias}${locators.join('')}`;
    const signals = toSignalMap(action);

    if (signals.dialog) {
      formatter.add(`  ${pageAlias}.once('dialog', dialog => {
  console.log(\`Dialog message: $\{dialog.message()}\`);
  dialog.dismiss().catch(() => {});
});`);
    }

    if (signals.popup)
      formatter.add(`const ${signals.popup.popupAlias}Promise = ${pageAlias}.waitForEvent('popup');`);
    if (signals.download)
      formatter.add(`const download${signals.download.downloadAlias}Promise = ${pageAlias}.waitForEvent('download');`);

    debugLog(`[javascript] Generated signal handling code (${Date.now() - startTime}ms)`);
    // Generate the action code
    let actionCode = this._generateActionCall(subject, actionInContext);
    debugLog(`[javascript] Generated base action code (${Date.now() - startTime}ms)`);

    // Enhance with LLM if enabled
    if (this._useEnhancer && !(['closePage', 'screenshot'].includes(actionInContext.action.name))) {
      try {
        debugLog(`[javascript] Starting LLM enhancement (${Date.now() - startTime}ms)`);
        actionCode = await enhanceWithLLM(actionCode, action, actionInContext);
        debugLog(`[javascript] Completed LLM enhancement (${Date.now() - startTime}ms)`);
      } catch (error) {
        process.stdout.write(error);
        // Continue with the original code if enhancement fails
      }
    }

    formatter.add(wrapWithStep(actionInContext.description, actionCode));
    debugLog(`[javascript] Added formatted code to output (${Date.now() - startTime}ms)`);

    if (signals.popup)
      formatter.add(`const ${signals.popup.popupAlias} = await ${signals.popup.popupAlias}Promise;`);
    if (signals.download)
      formatter.add(`const download${signals.download.downloadAlias} = await download${signals.download.downloadAlias}Promise;`);

    debugLog(`[javascript] Completed code generation for action: ${action.name} (${Date.now() - startTime}ms)`);
    return formatter.format();
  }

  private _generateActionCall(subject: string, actionInContext: actions.ActionInContext): string {
    const action = actionInContext.action;
    // console.log('generateActionCall - ', JSON.stringify(action, null, 2));
    // console.log('Action type: ', action.name);
    // console.log('Action selector: ', (action as any).selector);

    switch (action.name) {
      case 'openPage':
        throw Error('Not reached');
      case 'closePage':
        return `await ${subject}.close();`;
      case 'click': {
        let method = 'click';
        if (action.clickCount === 2)
          method = 'dblclick';
        const options = toClickOptionsForSourceCode(action);
        const optionsString = formatOptions(options, false);

        // Include targeting comments if targetInfo is available
        let result = `await ${subject}.${this._asLocator(action.selector)}.${method}(${optionsString});`;
        if (action.targetInfo) {
          const { tagName, elementClasses } = action.targetInfo;
          const comments = [];
          comments.push(`// Clicked on ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}`);
          if (comments.length > 0)
            result = comments.join('\n') + '\n' + result;
        }

        return result;
      }
      case 'check':
        // Include targeting comments if targetInfo is available
        let checkResult = `await ${subject}.${this._asLocator(action.selector)}.check();`;
        if (action.targetInfo) {
          const { tagName, elementClasses, inputType } = action.targetInfo;
          const comments = [];
          comments.push(`// Checked ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}${inputType ? ` (type="${inputType}")` : ''}`);
          if (comments.length > 0)
            checkResult = comments.join('\n') + '\n' + checkResult;
        }
        return checkResult;
      case 'uncheck':
        // Include targeting comments if targetInfo is available
        let uncheckResult = `await ${subject}.${this._asLocator(action.selector)}.uncheck();`;
        if (action.targetInfo) {
          const { tagName, elementClasses, inputType } = action.targetInfo;
          const comments = [];
          comments.push(`// Unchecked ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}${inputType ? ` (type="${inputType}")` : ''}`);
          if (comments.length > 0)
            uncheckResult = comments.join('\n') + '\n' + uncheckResult;
        }
        return uncheckResult;
      case 'fill':
        // Include targeting comments if targetInfo is available
        let fillResult = `await ${subject}.${this._asLocator(action.selector)}.fill(${quote(action.text)});`;
        if (action.targetInfo) {
          const { tagName, elementClasses, inputType } = action.targetInfo;
          const comments = [];
          comments.push(`// Filled ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}${inputType ? ` (type="${inputType}")` : ''}`);
          comments.push(`// Entered text: "${action.text}"`);
          if (comments.length > 0)
            fillResult = comments.join('\n') + '\n' + fillResult;
        }
        return fillResult;
      case 'setInputFiles':
        return `await ${subject}.${this._asLocator(action.selector)}.setInputFiles(${formatObject(action.files.length === 1 ? action.files[0] : action.files)});`;
      case 'press': {
        const modifiers = toKeyboardModifiers(action.modifiers);
        const shortcut = [...modifiers, action.key].join('+');
        // Include targeting comments if targetInfo is available
        let pressResult = `await ${subject}.${this._asLocator(action.selector)}.press(${quote(shortcut)});`;
        if (action.targetInfo) {
          const { tagName, elementClasses } = action.targetInfo;
          const comments = [];
          comments.push(`// Pressed ${shortcut} on ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}`);
          if (comments.length > 0)
            pressResult = comments.join('\n') + '\n' + pressResult;
        }
        return pressResult;
      }
      case 'navigate':
        return `await ${subject}.goto(${quote(action.url)});`;
      case 'select':
        // Include targeting comments if targetInfo is available
        let selectResult = `await ${subject}.${this._asLocator(action.selector)}.selectOption(${formatObject(action.options.length === 1 ? action.options[0] : action.options)});`;
        if (action.targetInfo) {
          const { tagName, elementClasses, optionsCount } = action.targetInfo;
          const comments = [];
          comments.push(`// Selected option in ${tagName}${elementClasses ? ` with classes "${elementClasses}"` : ''}${optionsCount ? ` (${optionsCount} options available)` : ''}`);
          comments.push(`// Selected value(s): ${JSON.stringify(action.options)}`);
          if (comments.length > 0)
            selectResult = comments.join('\n') + '\n' + selectResult;
        }
        return selectResult;
      case 'assertText':
        return `${this._isTest ? '' : '// '}await expect(${subject}.${this._asLocator(action.selector)}).${action.substring ? 'toContainText' : 'toHaveText'}(${quote(action.text)});`;
      case 'assertChecked':
        return `${this._isTest ? '' : '// '}await expect(${subject}.${this._asLocator(action.selector)})${action.checked ? '' : '.not'}.toBeChecked();`;
      case 'assertVisible':
        return `${this._isTest ? '' : '// '}await expect(${subject}.${this._asLocator(action.selector)}).toBeVisible();`;
      case 'assertValue': {
        const assertion = action.value ? `toHaveValue(${quote(action.value)})` : `toBeEmpty()`;
        return `${this._isTest ? '' : '// '}await expect(${subject}.${this._asLocator(action.selector)}).${assertion};`;
      }
      case 'assertSnapshot': {
        const commentIfNeeded = this._isTest ? '' : '// ';
        return `${commentIfNeeded}await expect(${subject}.${this._asLocator(action.selector)}).toMatchAriaSnapshot(${quoteMultiline(action.snapshot, `${commentIfNeeded}  `)});`;
      }
      case 'screenshot': {
        // Make sure we're using the correct property structure for screenshot
        const options = (action as any).options || {};
        const path = options.path ? `, { path: ${quote(options.path)} }` : '';
        return `await ${subject}.${this._asLocator(action.selector)}.screenshot(${path});`;
      }
      case 'extractText': {
        // Make sure we're using the correct property structure for extractText
        const variableName = (action as any).variableName || 'extractedText';
        const contentType = (action as any).contentType || 'text';
        const comments = [`// Extracted ${contentType} from element into variable: ${variableName}`];
        const extractMethod = contentType === 'text' ? 'textContent()' : 'inputValue()';
        return `${comments.join('\n')}\nconst ${variableName} = await ${subject}.${this._asLocator(action.selector)}.${extractMethod};`;
      }
      default:
        throw new Error(`Unknown action: ${(action as any).name}`);
    }
  }

  private _asLocator(selector: string) {
    return asLocator('javascript', selector);
  }

  generateHeader(options: LanguageGeneratorOptions): string {
    if (this._isTest)
      return this.generateTestHeader(options);
    return this.generateStandaloneHeader(options);
  }

  generateFooter(saveStorage: string | undefined): string {
    if (this._isTest)
      return this.generateTestFooter(saveStorage);
    return this.generateStandaloneFooter(saveStorage);
  }

  generateTestHeader(options: LanguageGeneratorOptions): string {
    const formatter = new JavaScriptFormatter();
    const useText = formatContextOptions(options.contextOptions, options.deviceName, this._isTest);
    formatter.add(`
      import { test, expect${options.deviceName ? ', devices' : ''} } from '@playwright/test';
${useText ? '\ntest.use(' + useText + ');\n' : ''}
      test('test', async ({ page }) => {`);
    if (options.contextOptions.recordHar) {
      const url = options.contextOptions.recordHar.urlFilter;
      formatter.add(`  await page.routeFromHAR(${quote(options.contextOptions.recordHar.path)}${url ? `, ${formatOptions({ url }, false)}` : ''});`);
    }
    return formatter.format();
  }

  generateTestFooter(saveStorage: string | undefined): string {
    return `});`;
  }

  generateStandaloneHeader(options: LanguageGeneratorOptions): string {
    const formatter = new JavaScriptFormatter();
    formatter.add(`
      const { ${options.browserName}${options.deviceName ? ', devices' : ''} } = require('playwright');

      (async () => {
        const browser = await ${options.browserName}.launch(${formatObjectOrVoid(options.launchOptions)});
        const context = await browser.newContext(${formatContextOptions(options.contextOptions, options.deviceName, false)});`);
    if (options.contextOptions.recordHar)
      formatter.add(`        await context.routeFromHAR(${quote(options.contextOptions.recordHar.path)});`);
    return formatter.format();
  }

  generateStandaloneFooter(saveStorage: string | undefined): string {
    const storageStateLine = saveStorage ? `\n  await context.storageState({ path: ${quote(saveStorage)} });` : '';
    return `\n  // ---------------------${storageStateLine}
  await context.close();
  await browser.close();
})();`;
  }
}

function formatOptions(value: any, hasArguments: boolean): string {
  const keys = Object.keys(value);
  if (!keys.length)
    return '';
  return (hasArguments ? ', ' : '') + formatObject(value);
}

function formatObject(value: any, indent = '  '): string {
  if (typeof value === 'string')
    return quote(value);
  if (Array.isArray(value))
    return `[${value.map(o => formatObject(o)).join(', ')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
    if (!keys.length)
      return '{}';
    const tokens: string[] = [];
    for (const key of keys)
      tokens.push(`${key}: ${formatObject(value[key])}`);
    return `{\n${indent}${tokens.join(`,\n${indent}`)}\n}`;
  }
  return String(value);
}

function formatObjectOrVoid(value: any, indent = '  '): string {
  const result = formatObject(value, indent);
  return result === '{}' ? '' : result;
}

function formatContextOptions(options: BrowserContextOptions, deviceName: string | undefined, isTest: boolean): string {
  const device = deviceName && deviceDescriptors[deviceName];
  // recordHAR is replaced with routeFromHAR in the generated code.
  options = { ...options, recordHar: undefined };
  if (!device)
    return formatObjectOrVoid(options);
  // Filter out all the properties from the device descriptor.
  let serializedObject = formatObjectOrVoid(sanitizeDeviceOptions(device, options));
  // When there are no additional context options, we still want to spread the device inside.
  if (!serializedObject)
    serializedObject = '{\n}';
  const lines = serializedObject.split('\n');
  lines.splice(1, 0, `...devices[${quote(deviceName!)}],`);
  return lines.join('\n');
}

export class JavaScriptFormatter {
  private _baseIndent: string;
  private _baseOffset: string;
  private _lines: string[] = [];

  constructor(offset = 0) {
    this._baseIndent = ' '.repeat(2);
    this._baseOffset = ' '.repeat(offset);
  }

  prepend(text: string) {
    const trim = isMultilineString(text) ? (line: string) => line : (line: string) => line.trim();
    this._lines = text.trim().split('\n').map(trim).concat(this._lines);
  }

  add(text: string) {
    const trim = isMultilineString(text) ? (line: string) => line : (line: string) => line.trim();
    this._lines.push(...text.trim().split('\n').map(trim));
  }

  newLine() {
    this._lines.push('');
  }

  format(): string {
    let spaces = '';
    let previousLine = '';
    return this._lines.map((line: string) => {
      if (line === '')
        return line;
      if (line.startsWith('}') || line.startsWith(']'))
        spaces = spaces.substring(this._baseIndent.length);

      const extraSpaces = /^(for|while|if|try).*\(.*\)$/.test(previousLine) ? this._baseIndent : '';
      previousLine = line;

      const callCarryOver = line.startsWith('.set');
      line = spaces + extraSpaces + (callCarryOver ? this._baseIndent : '') + line;
      if (line.endsWith('{') || line.endsWith('['))
        spaces += this._baseIndent;
      return this._baseOffset + line;
    }).join('\n');
  }
}

function quote(text: string) {
  return escapeWithQuotes(text, '\'');
}

function wrapWithStep(description: string | undefined, body: string) {
  return description ? `await test.step(\`${description}\`, async () => {
${body}
});` : body;
}

export function quoteMultiline(text: string, indent = '  ') {
  const escape = (text: string) => text.replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
  const lines = text.split('\n');
  if (lines.length === 1)
    return '`' + escape(text) + '`';
  return '`\n' + lines.map(line => indent + escape(line).replace(/\${/g, '\\${')).join('\n') + `\n${indent}\``;
}

function isMultilineString(text: string) {
  return text.match(/`[\S\s]*`/)?.[0].includes('\n');
}
