# playwright-core

This package contains the no-browser flavor of [Playwright](http://github.com/microsoft/playwright).

## LLM Code Enhancement

Playwright now includes an experimental feature that can enhance generated code using a local LLM (Language Learning Model). This feature works with [Ollama](https://ollama.ai/) to improve the quality of code generated during recording sessions.

### Per-Action Enhancement

When enabled, each action recorded by Playwright will be enhanced with better comments and practices. To enable this feature:

1. Set the environment variable: `PW_USE_LLM_ENHANCER=1` 
2. Ensure you have a local Ollama server running (default: http://localhost:11434)
3. The default model is "llama3", but you can change it by setting the `OLLAMA_MODEL` environment variable

### Full Script Enhancement

Additionally, when a page is closed, the complete generated script can be enhanced for better organization, error handling, and readability:

1. Set the environment variable: `PW_ENHANCE_FULL_SCRIPT=1`
2. This will automatically enhance the complete test script when recording is finished

### Benefits

- Better organization of tests into logical sections
- Improved error handling and recovery mechanisms
- More maintainable selectors
- Appropriate waits and timeouts
- Better comments explaining the purpose of test steps

Note: This is an experimental feature and requires a local Ollama server with appropriate models installed.
