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
 * Configuration interface for the LLM code enhancer
 * 
 * This interface defines all configurable settings for the Playwright
 * LLM code enhancement features. These settings can be provided via
 * a configuration file (playwright.llm.json or .playwright/llm.config.json)
 * or through environment variables.
 */
export interface LLMConfig {
  /**
   * Ollama LLM configuration settings
   */
  ollama: {
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
     * Temperature setting for regular code enhancement
     * Higher values (e.g., 0.7) produce more creative output
     * Lower values (e.g., 0.1) produce more deterministic output
     * Default: 0.2
     */
    temperature?: number;
    
    /**
     * Maximum number of tokens to predict (for token-limited models)
     * Default: 300
     */
    numPredict?: number;
    
    /**
     * Temperature setting specifically for complete script enhancement
     * The complete script enhancement uses a slightly higher temperature
     * for more creative restructuring of the entire test script
     * Default: 0.7
     */
    completeScriptTemperature?: number;
  };
  
  /**
   * Enable debug logging for LLM operations
   * When true, detailed logs of LLM operations will be printed
   * Default: false
   */
  debug: boolean;
  
  /**
   * Prompt templates used for LLM interactions
   */
  prompts: {
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
  };
}

/**
 * Default configuration for the LLM enhancer
 * These values are used if no configuration file is found
 * and no environment variables are set.
 */
export const defaultLLMConfig: LLMConfig = {
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

Return the complete improved test script. Do not include explanations, just the improved code.`
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
  if (process.env.OLLAMA_BASE_URL)
    config.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.OLLAMA_MODEL)
    config.ollama.model = process.env.OLLAMA_MODEL;
  if (process.env.PW_DEBUG_LLM === '1')
    config.debug = true;
  
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
  
  if (userConfig.ollama) {
    result.ollama = {
      ...result.ollama,
      ...userConfig.ollama
    };
  }
  
  if (userConfig.debug !== undefined)
    result.debug = userConfig.debug;
  
  if (userConfig.prompts) {
    result.prompts = {
      ...result.prompts,
      ...userConfig.prompts
    };
  }
  
  return result;
} 