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

import fs from 'fs';
import path from 'path';

/**
 * Type of LLM provider to use
 */
export type LLMProviderType = 'ollama' | 'openai' | 'anthropic' | 'azure-openai' | 'custom';

/**
 * Base configuration for all LLM providers
 */
interface BaseLLMProviderConfig {
  /**
   * Temperature setting for regular code enhancement
   * Higher values (e.g., 0.7) produce more creative output
   * Lower values (e.g., 0.1) produce more deterministic output
   * Default: 0.2
   */
  temperature?: number;
  
  /**
   * Maximum number of tokens to predict
   */
  maxTokens?: number;
  
  /**
   * Temperature setting specifically for complete script enhancement
   * Default: 0.7
   */
  completeScriptTemperature?: number;
}

/**
 * Ollama-specific configuration
 */
interface OllamaConfig extends BaseLLMProviderConfig {
  /**
   * Base URL for the Ollama API
   * Default: http://localhost:11434
   */
  baseUrl: string;
  
  /**
   * Model name to use for code enhancement
   * This can be any model supported by your Ollama installation
   * Default: llama3
   */
  model: string;
  
  /**
   * Legacy numPredict parameter for Ollama
   */
  numPredict?: number;
}

/**
 * OpenAI-specific configuration
 */
interface OpenAIConfig extends BaseLLMProviderConfig {
  /**
   * API key for OpenAI
   */
  apiKey: string;
  
  /**
   * Model name to use
   * Default: gpt-3.5-turbo
   */
  model: string;
  
  /**
   * Optional organization ID for OpenAI
   */
  organization?: string;
  
  /**
   * Base URL for API (useful for proxies)
   * Default: https://api.openai.com/v1
   */
  baseUrl?: string;
}

/**
 * Anthropic (Claude) specific configuration
 */
interface AnthropicConfig extends BaseLLMProviderConfig {
  /**
   * API key for Anthropic
   */
  apiKey: string;
  
  /**
   * Model name to use
   * Default: claude-3-sonnet-20240229
   */
  model: string;
  
  /**
   * Base URL for API (useful for proxies)
   * Default: https://api.anthropic.com
   */
  baseUrl?: string;
}

/**
 * Azure OpenAI configuration
 */
interface AzureOpenAIConfig extends BaseLLMProviderConfig {
  /**
   * API key for Azure OpenAI
   */
  apiKey: string;
  
  /**
   * Azure OpenAI deployment name
   */
  deploymentName: string;
  
  /**
   * Azure OpenAI endpoint
   * Example: https://your-resource-name.openai.azure.com
   */
  endpoint: string;
  
  /**
   * API version
   * Default: 2023-05-15
   */
  apiVersion?: string;
}

/**
 * Custom LLM provider configuration
 * For advanced users who want to integrate with other LLM providers
 */
interface CustomProviderConfig extends BaseLLMProviderConfig {
  /**
   * Provider-specific configuration object
   * This will be passed directly to the custom provider implementation
   */
  providerOptions: Record<string, any>;
  
  /**
   * Path to a JavaScript/TypeScript module that exports a custom provider implementation
   * Must export a class that implements the LLMProvider interface
   */
  providerModulePath: string;
}

/**
 * Prompt template configuration for LLM interactions
 */
interface PromptTemplates {
  /**
   * System prompt for individual action enhancement
   * This prompt guides the LLM to enhance a single action
   */
  systemPrompt: string;
  
  /**
   * System prompt for complete script enhancement
   * This prompt guides the LLM to enhance an entire test script
   */
  completeScriptSystemPrompt: string;
  
  /**
   * Template for user prompt for individual action enhancement
   * Available variables:
   * - {{actionData}}: The JSON stringified action data
   * - {{elementContext}}: Information about the element being interacted with
   * - {{generatedCode}}: The original generated code
   */
  userPromptTemplate: string;
  
  /**
   * Template for user prompt for complete script enhancement
   * Available variables:
   * - {{completeScript}}: The full generated test script
   */
  completeScriptUserPromptTemplate: string;
}

/**
 * Configuration interface for the LLM code enhancer
 * 
 * This interface defines all configurable settings for the Playwright
 * LLM code enhancement features. These settings can be provided via
 * a configuration file (playwright.llm.json or .playwright/llm.config.json)
 * or through environment variables.
 */
export interface LLMConfig {
  /**
   * The LLM provider to use
   * Default: ollama
   */
  provider: LLMProviderType;
  
  /**
   * Ollama-specific configuration
   * Only used when provider is 'ollama'
   */
  ollama?: OllamaConfig;
  
  /**
   * OpenAI-specific configuration
   * Only used when provider is 'openai'
   */
  openai?: OpenAIConfig;
  
  /**
   * Anthropic (Claude) specific configuration
   * Only used when provider is 'anthropic'
   */
  anthropic?: AnthropicConfig;
  
  /**
   * Azure OpenAI specific configuration
   * Only used when provider is 'azure-openai'
   */
  azureOpenai?: AzureOpenAIConfig;
  
  /**
   * Custom provider configuration
   * Only used when provider is 'custom'
   */
  customProvider?: CustomProviderConfig;
  
  /**
   * Enable debug logging for LLM operations
   * When true, detailed logs of LLM operations will be printed
   * Default: false
   */
  debug: boolean;
  
  /**
   * Prompt templates used for LLM interactions
   */
  prompts: PromptTemplates;
}

/**
 * Default configuration for the LLM enhancer
 * These values are used if no configuration file is found
 * and no environment variables are set.
 */
export const defaultLLMConfig: LLMConfig = {
  provider: 'ollama',
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3',
    temperature: 0.2,
    numPredict: 300,
    completeScriptTemperature: 0.7
  },
  debug: false,
  prompts: {
    systemPrompt: `You are an expert Playwright test developer. Your task is to enhance the generated test code with better comments, assertions, or any improvements that make the test more robust and maintainable.
    
Focus on these aspects:
1. Better descriptive comments about the element interactions
2. Additional assertions that verify the expected state
3. More maintainable code structure
4. Preserve the existing functionality but make it more robust
5. Use the provided element information (XPath, JS Path, etc.) to create more robust selectors or fallback selectors when appropriate

Just return the improved code without explanations.`,
    completeScriptSystemPrompt: `You are an expert Playwright test automation engineer. You need to optimize and improve a full Playwright test script.

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

Return the complete improved test script. Do not include explanations, just the improved code.`,
    userPromptTemplate: `Here's a Playwright action in JSON format:
\`\`\`json
{{actionData}}
\`\`\`
{{elementContext}}
Here's the generated code for this action:
\`\`\`javascript
{{generatedCode}}
\`\`\`

Please enhance this code to make it more robust and maintainable while preserving its functionality. When appropriate, consider using the element paths information to create more reliable selectors or fallback mechanisms.`,
    completeScriptUserPromptTemplate: `Here is a complete Playwright test script that was auto-generated. Please analyze and improve it to make it more robust, maintainable, and reliable:

\`\`\`javascript
{{completeScript}}
\`\`\`

Please provide the complete enhanced test script.`
  }
};

/**
 * Loads and returns the LLM configuration
 * 
 * The configuration is loaded using the following priority:
 * 1. Environment variables (highest priority)
 * 2. Custom config path (if provided)
 * 3. Default locations (playwright.llm.json or .playwright/llm.config.json)
 * 4. Default configuration (lowest priority)
 * 
 * @param configPath Optional path to a custom configuration file
 * @returns The merged LLM configuration
 */
export function loadLLMConfig(configPath?: string): LLMConfig {
  let config = { ...defaultLLMConfig };
  
  // Override with environment variables
  if (process.env.OLLAMA_BASE_URL && config.ollama) {
    config.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
  }
  
  if (process.env.OLLAMA_MODEL && config.ollama) {
    config.ollama.model = process.env.OLLAMA_MODEL;
  }
  
  if (process.env.OPENAI_API_KEY) {
    config.provider = 'openai';
    config.openai = config.openai || {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      temperature: 0.2,
      maxTokens: 1024,
      completeScriptTemperature: 0.7
    };
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    config.provider = 'anthropic';
    config.anthropic = config.anthropic || {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
      temperature: 0.2,
      maxTokens: 1024,
      completeScriptTemperature: 0.7
    };
  }
  
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT) {
    config.provider = 'azure-openai';
    config.azureOpenai = config.azureOpenai || {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2023-05-15',
      temperature: 0.2,
      maxTokens: 1024,
      completeScriptTemperature: 0.7
    };
  }
  
  if (process.env.PW_DEBUG_LLM === '1') {
    config.debug = true;
  }
  
  // If config path is provided, load and merge with defaults
  if (configPath && fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = mergeConfigs(config, userConfig);
    } catch (error) {
      console.error(`Error loading LLM config from ${configPath}:`, error);
    }
  } else {
    // Look for config in default locations
    const defaultLocations = [
      path.join(process.cwd(), 'playwright.llm.json'),
      path.join(process.cwd(), '.playwright', 'llm.config.json')
    ];
    
    for (const location of defaultLocations) {
      if (fs.existsSync(location)) {
        try {
          const userConfig = JSON.parse(fs.readFileSync(location, 'utf-8'));
          config = mergeConfigs(config, userConfig);
          break;
        } catch (error) {
          console.error(`Error loading LLM config from ${location}:`, error);
        }
      }
    }
  }
  
  return config;
}

/**
 * Merges a user configuration with the default configuration
 * 
 * @param defaultConfig The default configuration
 * @param userConfig The user-provided configuration (partial)
 * @returns The merged configuration
 */
function mergeConfigs(defaultConfig: LLMConfig, userConfig: Partial<LLMConfig>): LLMConfig {
  const result = { ...defaultConfig };
  
  // Override provider if specified
  if (userConfig.provider) {
    result.provider = userConfig.provider;
  }
  
  // Merge provider-specific configs
  if (userConfig.ollama && result.ollama) {
    result.ollama = {
      ...result.ollama,
      ...userConfig.ollama
    };
  }
  
  if (userConfig.openai) {
    result.openai = {
      ...result.openai,
      ...userConfig.openai
    };
  }
  
  if (userConfig.anthropic) {
    result.anthropic = {
      ...result.anthropic,
      ...userConfig.anthropic
    };
  }
  
  if (userConfig.azureOpenai) {
    result.azureOpenai = {
      ...result.azureOpenai,
      ...userConfig.azureOpenai
    };
  }
  
  if (userConfig.customProvider) {
    result.customProvider = {
      ...result.customProvider,
      ...userConfig.customProvider
    };
  }
  
  if (userConfig.debug !== undefined) {
    result.debug = userConfig.debug;
  }
  
  // Merge prompt templates
  if (userConfig.prompts) {
    result.prompts = {
      ...result.prompts,
      ...userConfig.prompts
    };
  }
  
  return result;
}

/**
 * Processes a template string by replacing variables
 * 
 * @param template The template string with {{variable}} placeholders
 * @param variables Object containing variable values to replace
 * @returns The processed string with variables replaced
 */
export function processTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return result;
} 