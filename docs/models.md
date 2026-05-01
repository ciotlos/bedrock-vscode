# Models

## Available Models

The extension exposes all Bedrock foundation models with streaming capabilities in your configured region:

| Provider | Models | Thinking Support |
|---|---|---|
| **Anthropic** | Claude Opus 4, Sonnet 4, Sonnet 3.7, Sonnet 3.5, Haiku 3.5 | Opus 4, Sonnet 4, Sonnet 3.7 |
| **Meta** | Llama 4 Maverick/Scout, Llama 3.3, 3.2, 3.1 | — |
| **Mistral** | Large 2, Large, Small, Mixtral 8x7B | — |
| **Amazon** | Nova Premier, Pro, Lite, Micro | Nova Premier |
| **DeepSeek** | R1 | R1 |
| **Cohere** | Command R+, Command R, Command Light | — |
| **AI21** | Jamba 1.5 Large, Jamba 1.5 Mini, Jamba Instruct | — |

## Model Selection

Model selection is integrated into VS Code's chat interface:
1. Open GitHub Copilot Chat
2. Click the model dropdown at the top of the chat panel
3. Select any available Bedrock model

## Extended Thinking

Models with thinking support show the model's internal reasoning process before providing answers. Enable it in Settings:

- **Enable Extended Thinking**: Toggle on/off (default: disabled)
- **Thinking Budget Tokens**: Max tokens for thinking (1024-32768, default: 1024)

When thinking is enabled, temperature is automatically set to 1.0 (required by the models).

## Cross-Region Inference Profiles

The extension automatically detects [inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html) in your region. When available, models use cross-region routing for better availability and are labeled "Multi-Region" in the model picker.

## Model Metadata

AWS Bedrock's API does not expose token limits (context window, max output tokens) or thinking support flags. This metadata is bundled as a static file (`src/data/model-metadata.ts`) and updated with each extension release.

When a model is fetched from Bedrock but has no matching static metadata:
- Default values are used (200k context, 4096 max output, no thinking)
- A warning is logged to the "AWS Bedrock" output channel
- The model tooltip shows "(unverified token limits)"

See the [model metadata maintenance guide](./model-metadata-maintenance.md) for how to update the static data.

## Prompt Caching

Bedrock supports [prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) for Claude and Nova models, which can reduce latency by up to 80% and cost by up to 85% for repeated conversation prefixes. This feature is **not yet implemented** in the extension and is planned for a future release.
