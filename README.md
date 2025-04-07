# 🎭 Playwright - With LLM Enhanced Codegen

This is a fork of the [Playwright](https://playwright.dev) project that adds enhanced code generation capabilities, integrates with LLMs, and improves the developer experience when generating test automation scripts.

## 🚀 Enhanced Features

### Recorder Enhancements

The Playwright Recorder has been enhanced with several new features:

1. **Screenshot Capture Button**
   - Quickly capture screenshots during test recording
   - Automatically generates unique filenames
   - Adds the screenshot command to your generated test code

2. **Text Extraction Button**
   - Extract text content or values from elements
   - Automatically determines if the element has text content or a value
   - Stores the extracted content in variables for use in your tests

3. **Detailed Element Information**
   - Records XPath, full XPath, and JS Path for each element
   - Captures outerHTML samples for better context
   - Provides detailed element attributes for more robust selectors

4. **LLM Integration**
   - Enhances generated code with LLM-powered improvements
   - Uses element context to create better selectors and more maintainable code
   - Automatically optimizes tests for readability and robustness
   - Configurable via JSON configuration file
   - Support for multiple LLM providers (Ollama, OpenAI, Claude, Azure OpenAI, custom)
   - Customizable prompt templates for fine-tuning LLM responses

5. **Enhanced Logging**
   - Captures detailed recorder events for better debugging
   - Logs element interactions with rich context
   - Provides real-time monitoring during code generation

## Design And Design Logic

![Design](<docs/Untitled Diagram.drawio.svg>)

Problem - trying to solve using this AI Enhanced Codegen - I was working on project where there were really long 
test scripts to be developed for a website that was really shitty. Codegen usually gives the wrong code for that 
website. Further problem there were two different sets of people one who knew what test needs to be built and 
other the test developers. Wanted to ensure that enhanced codegen was able to add validations and all the values
in the script as variables

Solution - First as soon as 



### Debug & Monitoring Tools

1. **Watch-Recorder Script**
   - Real-time monitoring of recorder events
   - Colorized output for better readability
   - Filters to show only relevant recorder information

2. **Environment Configuration**
   - Easy configuration via `.env` file or JSON config file
   - Toggle different debug features on/off
   - Customize LLM integration settings including models, prompts, and parameters

## 📋 How to Use

### Taking Screenshots

1. Start the Playwright Codegen tool
2. Click the camera icon in the toolbar
3. Select the element you want to capture
4. The screenshot command is added to your test script

### Extracting Text

1. Start the Playwright Codegen tool
2. Click the text extraction icon in the toolbar
3. Select an element containing text or a value
4. The text/value is stored in a variable in your test script

### Using LLM Enhancement

1. Set up the LLM configuration using environment variables or a configuration file
2. Run Playwright Codegen as usual
3. The generated code is automatically enhanced with better selectors, comments, and error handling

## 🛠️ Setup

### Environment Variables

The `.env` file controls various features:

```
# Enable the LLM enhancer for generated code
PW_USE_LLM_ENHANCER=1

# LLM provider selection
# To use OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo

# OR to use Anthropic (Claude)
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# OR to use Azure OpenAI
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# OR to use Ollama (default)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Debug settings
PW_DEBUG_LLM=1
DEBUG=pw:recorder,pw:protocol,pw:browser,pw:api

# Log file settings
DEBUG_FILE=playwright-debug.log

# Recorder visualization
PW_SHOW_ELEMENT_PATHS=1
```

### LLM Configuration File

You can now configure the LLM enhancer using a JSON configuration file. Create a file named `playwright.llm.json` in your project root or `.playwright/llm.config.json` with the following structure:

```json
{
  "provider": "openai",
  "openai": {
    "apiKey": "your-openai-api-key",
    "model": "gpt-3.5-turbo",
    "temperature": 0.2,
    "maxTokens": 1024
  },
  "debug": false,
  "prompts": {
    "systemPrompt": "You are an expert Playwright test developer...",
    "completeScriptSystemPrompt": "You are an expert Playwright test automation engineer...",
    "userPromptTemplate": "Here's a Playwright action in JSON format:\n```json\n{{actionData}}\n```\n{{elementContext}}\nHere's the generated code for this action:\n```javascript\n{{generatedCode}}\n```\n\nPlease enhance this code...",
    "completeScriptUserPromptTemplate": "Here is a complete Playwright test script that was auto-generated...\n\n```javascript\n{{completeScript}}\n```\n\nPlease provide the complete enhanced test script."
  }
}
```

The configuration file allows you to:
- Choose from multiple LLM providers (Ollama, OpenAI, Claude, Azure OpenAI, or custom)
- Set API keys, endpoints, and model names
- Configure temperature and token limits for each provider
- Customize both system and user prompts with templates
- Enable/disable debug logging

Template variables for user prompts:
- `{{actionData}}`: The JSON data of the action being processed
- `{{elementContext}}`: Detailed information about the element
- `{{generatedCode}}`: The original generated code for enhancement
- `{{completeScript}}`: The complete script for full-script enhancement

Environment variables will override settings in the configuration file.

### Scripts

The repository includes helpful scripts:

- `watch-recorder.sh`: Monitor recorder events in real-time
- `run-codegen.sh`: Run Playwright Codegen with enhanced features

## 🔍 Implementation Details

### Architecture

The enhanced recorder is built on top of Playwright's existing recorder infrastructure:

1. **UI Layer**
   - Added new buttons to the recorder overlay
   - Implemented visual feedback for new tools

2. **Action Layer**
   - Created new action types for screenshot and text extraction
   - Extended the recorder's event handling system

3. **LLM Integration Layer**
   - Provider-agnostic architecture supporting multiple LLMs
   - Enhanced prompts with detailed element context
   - Customizable templates for fine-tuning LLM behavior
   - Configurable via JSON configuration files

4. **Logging System**
   - Extended Playwright's debug system
   - Added structured event logging
   - Implemented colorized output for better readability

### Code Structure

Key modified files:
- `packages/playwright-core/src/server/injected/recorder/recorder.ts`: Added new tools and UI elements
- `packages/recorder/src/recorderTypes.d.ts`: Extended Mode types
- `packages/recorder/src/actions.d.ts`: Added new action types
- `packages/playwright-core/src/server/codegen/llmEnhancer.ts`: Enhanced LLM integration
- `packages/playwright-core/src/server/codegen/llmConfig.ts`: Configuration management for LLM features
- `packages/playwright-core/src/server/codegen/llmProvider.ts`: Multi-provider LLM integration

## 💼 Use Cases

1. **Test Automation**
   - Quickly generate robust test scripts
   - Extract dynamic text for assertions
   - Capture visual evidence with screenshots

2. **Web Scraping**
   - Extract text content from elements
   - Store values in variables
   - Generate more maintainable scraping code

3. **UI Testing**
   - Verify visual elements with screenshots
   - Assert on text content
   - Generate tests with better error handling

## ✅ Completed Features
- LLM configuration via environment variables and JSON config files
- Multi-provider support (Ollama, OpenAI, Claude, Azure OpenAI, custom)
- Customizable prompt templates with variable substitution
- Configurable model parameters (temperature, token limits)
- Automatic caching of LLM results for better performance
- Provider-agnostic architecture for easy extensibility

## 🔄 Contributing

Contributions are welcome! See the original Playwright contribution guidelines for details.

## 📄 License

This fork maintains the original Playwright license (Apache 2.0).

