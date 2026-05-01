# Model Metadata Maintenance

## Background

AWS Bedrock's `ListFoundationModels` and `GetFoundationModel` APIs do **not** return token limits (context window, max output tokens) or capability flags like thinking support. These values only exist in AWS documentation pages.

VS Code's `LanguageModelChatInformation` interface requires `maxInputTokens` and `maxOutputTokens`, so the extension bundles this data as a static file: `src/data/model-metadata.ts`.

## Detecting Missing Models

When a model is fetched from Bedrock but has no matching entry in the static file, the extension:
1. Logs a warning: `[Model Service] No static metadata for model "xxx". Using defaults.`
2. Shows "(unverified token limits)" in the model tooltip
3. Falls back to defaults: 200k context, 4096 max output, no thinking

Check the "Bedrock Chat" output channel (View → Output → Bedrock Chat) to see these warnings.

## How to Update

### Step 1: Find the model's documentation

Each provider has a dedicated page on AWS docs:

| Provider | Documentation URL |
|---|---|
| Anthropic | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html |
| Meta | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-meta.html |
| Mistral | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-mistral.html |
| Amazon Nova | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-nova.html |
| DeepSeek | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-deepseek.html |
| Cohere | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-cohere.html |
| AI21 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-ai21.html |

The supported models overview page is also useful:
https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html

### Step 2: Extract the values

From the documentation page, find:
- **"Context window"** or **"Max input tokens"** → `contextLength`
- **"Max output tokens"** or **"Max completion tokens"** → `maxOutputTokens`
- Whether **"extended thinking"** or **"reasoning"** is listed → `supportsThinking`

For thinking support specifically, check:
https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html

### Step 3: Add the entry

Edit `src/data/model-metadata.ts` and add an entry to the `MODEL_METADATA` array:

```typescript
{
    pattern: "new-model-name",
    metadata: { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: false },
},
```

### Pattern Matching Rules

- Bedrock model IDs look like: `us.anthropic.claude-3-7-sonnet-20250219-v1:0`
- The region prefix (`us.`, `eu.`, `ap.`, etc.) is stripped before matching
- The pattern is checked via `normalizedId.includes(pattern)`
- **Order matters**: more specific patterns must come before less specific ones (e.g., `claude-3-5-sonnet` before `claude-3-sonnet`)

### Step 4: Verify

```bash
npm run compile && npm run lint
```

## For AI Agents

If you're an AI agent updating this file, follow these steps:

1. Fetch the AWS documentation pages listed above using web search/fetch tools
2. For each new model found in the warning logs, locate its context window and max output tokens in the docs
3. Check the extended thinking page for thinking support
4. Add entries to `MODEL_METADATA` in `src/data/model-metadata.ts`, respecting pattern ordering
5. Run `npm run compile && npm run lint` to verify
6. The `isDefault` flag in the return type will confirm your new entries are being matched
