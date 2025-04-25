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

5. **Enhanced Logging**
   - Captures detailed recorder events for better debugging
   - Logs element interactions with rich context
   - Provides real-time monitoring during code generation

### Debug & Monitoring Tools

1. **Watch-Recorder Script**
   - Real-time monitoring of recorder events
   - Colorized output for better readability
   - Filters to show only relevant recorder information

2. **Environment Configuration**
   - Easy configuration via `.env` file
   - Toggle different debug features on/off
   - Customize LLM integration settings

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

1. Set up the LLM configuration in the `.env` file
2. Run Playwright Codegen as usual
3. The generated code is automatically enhanced with better selectors, comments, and error handling

## 🛠️ Setup

### Environment Variables

The `.env` file controls various features:

```
# Enable the LLM enhancer for generated code
PW_USE_LLM_ENHANCER=1

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=hf.co/DevQuasar/Qwen2.5-Coder-7B-Instruct-GGUF:Q8_0

# Debug settings
PW_DEBUG_LLM=1
DEBUG=pw:recorder,pw:protocol,pw:browser,pw:api

# Log file settings
DEBUG_FILE=playwright-debug.log

# Recorder visualization
PW_SHOW_ELEMENT_PATHS=1
```

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
   - Connected to local LLM via Ollama
   - Enhanced prompts with detailed element context
   - Optimized code generation process

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

## 🔄 Contributing

Contributions are welcome! See the original Playwright contribution guidelines for details.

## 📄 License

This fork maintains the original Playwright license (Apache 2.0).

