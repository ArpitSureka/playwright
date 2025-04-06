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
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { LLMConfig } from './llmConfig';

/**
 * Message role for chat-based LLMs
 */
export enum MessageRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant'
}

/**
 * Message structure for chat-based LLMs
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Options for generating LLM responses
 */
export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Interface for LLM providers
 * This enables different LLM backends to be used with the same enhancer
 */
export interface LLMProvider {
  /**
   * Generate a response from the LLM
   * 
   * @param messages Array of messages to send to the LLM
   * @param options Generation options
   * @returns The generated response as a string
   */
  generate(messages: Message[], options?: GenerateOptions): Promise<string>;
}

/**
 * Factory to create the appropriate LLM provider based on configuration
 */
export class LLMProviderFactory {
  /**
   * Create an LLM provider based on the provided configuration
   * 
   * @param config The LLM configuration
   * @returns An LLM provider instance
   */
  static createProvider(config: LLMConfig): LLMProvider {
    switch (config.provider) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'azure-openai':
        return new AzureOpenAIProvider(config);
      case 'custom':
        return new CustomProvider(config);
      default:
        return new OllamaProvider(config);
    }
  }
}

/**
 * Ollama-based LLM provider
 */
class OllamaProvider implements LLMProvider {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async generate(messages: Message[], options?: GenerateOptions): Promise<string> {
    if (!this.config.ollama) {
      throw new Error('Ollama configuration is missing');
    }
    
    const temperature = options?.temperature ?? this.config.ollama.temperature ?? 0.2;
    const numPredict = this.config.ollama.numPredict;
    
    const model = new ChatOllama({
      baseUrl: this.config.ollama.baseUrl,
      model: this.config.ollama.model,
      temperature,
      numPredict
    });
    
    const langchainMessages = messages.map(msg => {
      if (msg.role === MessageRole.System) {
        return new SystemMessage(msg.content);
      } else {
        return new HumanMessage(msg.content);
      }
    });
    
    const response = await model.call(langchainMessages);
    return response.content.toString();
  }
}

/**
 * OpenAI-based LLM provider
 */
class OpenAIProvider implements LLMProvider {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async generate(messages: Message[], options?: GenerateOptions): Promise<string> {
    if (!this.config.openai) {
      throw new Error('OpenAI configuration is missing');
    }
    
    const temperature = options?.temperature ?? this.config.openai.temperature ?? 0.2;
    const maxTokens = options?.maxTokens ?? this.config.openai.maxTokens;
    
    const model = new ChatOpenAI({
      apiKey: this.config.openai.apiKey,
      modelName: this.config.openai.model,
      temperature,
      maxTokens,
      organization: this.config.openai.organization,
      configuration: this.config.openai.baseUrl ? {
        baseURL: this.config.openai.baseUrl
      } : undefined
    });
    
    const langchainMessages = messages.map(msg => {
      if (msg.role === MessageRole.System) {
        return new SystemMessage(msg.content);
      } else {
        return new HumanMessage(msg.content);
      }
    });
    
    const response = await model.call(langchainMessages);
    return response.content.toString();
  }
}

/**
 * Anthropic-based LLM provider
 */
class AnthropicProvider implements LLMProvider {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async generate(messages: Message[], options?: GenerateOptions): Promise<string> {
    if (!this.config.anthropic) {
      throw new Error('Anthropic configuration is missing');
    }
    
    const temperature = options?.temperature ?? this.config.anthropic.temperature ?? 0.2;
    const maxTokens = options?.maxTokens ?? this.config.anthropic.maxTokens ?? 1024;
    
    const model = new ChatAnthropic({
      apiKey: this.config.anthropic.apiKey,
      modelName: this.config.anthropic.model,
      temperature,
      maxTokens,
      anthropicApiUrl: this.config.anthropic.baseUrl
    });
    
    const langchainMessages = messages.map(msg => {
      if (msg.role === MessageRole.System) {
        return new SystemMessage(msg.content);
      } else {
        return new HumanMessage(msg.content);
      }
    });
    
    const response = await model.call(langchainMessages);
    return response.content.toString();
  }
}

/**
 * Azure OpenAI-based LLM provider
 */
class AzureOpenAIProvider implements LLMProvider {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async generate(messages: Message[], options?: GenerateOptions): Promise<string> {
    if (!this.config.azureOpenai) {
      throw new Error('Azure OpenAI configuration is missing');
    }
    
    const temperature = options?.temperature ?? this.config.azureOpenai.temperature ?? 0.2;
    const maxTokens = options?.maxTokens ?? this.config.azureOpenai.maxTokens;
    
    const model = new ChatOpenAI({
      azureOpenAIApiKey: this.config.azureOpenai.apiKey,
      azureOpenAIApiDeploymentName: this.config.azureOpenai.deploymentName,
      azureOpenAIApiVersion: this.config.azureOpenai.apiVersion || '2023-05-15',
      azureOpenAIApiInstanceName: this.config.azureOpenai.endpoint.replace(/^https?:\/\//, '').replace(/\.openai\.azure\.com.*$/, ''),
      temperature,
      maxTokens
    });
    
    const langchainMessages = messages.map(msg => {
      if (msg.role === MessageRole.System) {
        return new SystemMessage(msg.content);
      } else {
        return new HumanMessage(msg.content);
      }
    });
    
    const response = await model.call(langchainMessages);
    return response.content.toString();
  }
}

/**
 * Custom LLM provider that loads provider implementation from a module
 */
class CustomProvider implements LLMProvider {
  private config: LLMConfig;
  private provider: LLMProvider | null = null;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async generate(messages: Message[], options?: GenerateOptions): Promise<string> {
    if (!this.config.customProvider) {
      throw new Error('Custom provider configuration is missing');
    }
    
    if (!this.provider) {
      try {
        // Dynamically import the custom provider module
        const module = await import(this.config.customProvider.providerModulePath);
        
        // The module should export a class that implements LLMProvider
        const ProviderClass = module.default || module.CustomProvider;
        if (!ProviderClass) {
          throw new Error(`No provider class exported from ${this.config.customProvider.providerModulePath}`);
        }
        
        this.provider = new ProviderClass(this.config.customProvider.providerOptions);
        
        // Check if the provider implements the required methods
        if (typeof this.provider.generate !== 'function') {
          throw new Error('Custom provider does not implement the generate method');
        }
      } catch (error) {
        console.error(`Error loading custom provider: ${error}`);
        throw new Error(`Failed to load custom provider: ${error}`);
      }
    }
    
    return this.provider.generate(messages, options);
  }
} 