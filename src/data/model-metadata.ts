/**
 * Static model metadata for known Bedrock models.
 * Replaces the runtime OpenRouter API call with bundled data.
 * Update this file when new models are added to Bedrock.
 *
 * ## Why this file exists
 *
 * AWS Bedrock's ListFoundationModels and GetFoundationModel APIs do NOT return
 * token limits (context window, max output tokens) or capability flags like
 * thinking support. These values only exist in AWS documentation pages.
 * VS Code's LanguageModelChatInformation interface requires maxInputTokens and
 * maxOutputTokens, so we must provide them from somewhere.
 *
 * ## How to update this file
 *
 * When new models appear in Bedrock, the extension logs a warning:
 *   [Model Service] No static metadata for model "xxx". Using defaults.
 *
 * To add the missing model, an AI agent or maintainer should:
 *
 * 1. **Find the model's documentation page** on AWS:
 *    - Base URL: https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 *    - Each provider has a dedicated page, e.g.:
 *      - Anthropic: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
 *      - Meta: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-meta.html
 *      - Mistral: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-mistral.html
 *      - Amazon Nova: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-nova.html
 *      - DeepSeek: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-deepseek.html
 *      - Cohere: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-cohere.html
 *      - AI21: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-ai21.html
 *
 * 2. **Extract from the documentation page**:
 *    - "Context window" or "Max input tokens" → contextLength
 *    - "Max output tokens" or "Max completion tokens" → maxOutputTokens
 *    - Whether "extended thinking" or "reasoning" is listed as supported → supportsThinking
 *
 * 3. **For thinking support specifically**, check:
 *    https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html
 *    This page lists all models that support extended thinking.
 *
 * 4. **Add an entry** to the MODEL_METADATA array below. Use a pattern string
 *    that matches the model ID after stripping the region prefix (e.g., "us.").
 *    More specific patterns should come before less specific ones.
 *
 * 5. **Run `npm run compile && npm run lint`** to verify.
 *
 * ## Pattern matching rules
 *
 * - Bedrock model IDs look like: `us.anthropic.claude-3-7-sonnet-20250219-v1:0`
 * - The region prefix (`us.`) is stripped before matching
 * - The pattern is checked via `normalizedId.includes(pattern)`
 * - Order matters: more specific patterns must come first
 *   (e.g., "claude-3-5-sonnet" before "claude-3-sonnet")
 */

export interface ModelMetadata {
	/** Maximum context window size in tokens. */
	contextLength: number;
	/** Maximum output tokens the model can generate. */
	maxOutputTokens: number;
	/** Whether the model supports extended thinking / reasoning. */
	supportsThinking: boolean;
}

/**
 * Known model metadata keyed by model ID prefix.
 * Matching is done by checking if the Bedrock model ID contains the key.
 * More specific keys should come first (checked in order).
 */
const MODEL_METADATA: Array<{ pattern: string; metadata: ModelMetadata }> = [
	// Anthropic Claude
	{
		pattern: "claude-sonnet-4",
		metadata: { contextLength: 200000, maxOutputTokens: 16384, supportsThinking: true },
	},
	{
		pattern: "claude-opus-4",
		metadata: { contextLength: 200000, maxOutputTokens: 16384, supportsThinking: true },
	},
	{
		pattern: "claude-3-7-sonnet",
		metadata: { contextLength: 200000, maxOutputTokens: 8192, supportsThinking: true },
	},
	{
		pattern: "claude-3-5-sonnet",
		metadata: { contextLength: 200000, maxOutputTokens: 8192, supportsThinking: false },
	},
	{
		pattern: "claude-3-5-haiku",
		metadata: { contextLength: 200000, maxOutputTokens: 8192, supportsThinking: false },
	},
	{
		pattern: "claude-3-opus",
		metadata: { contextLength: 200000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "claude-3-sonnet",
		metadata: { contextLength: 200000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "claude-3-haiku",
		metadata: { contextLength: 200000, maxOutputTokens: 4096, supportsThinking: false },
	},

	// Meta Llama
	{
		pattern: "llama4-maverick",
		metadata: { contextLength: 1048576, maxOutputTokens: 16384, supportsThinking: false },
	},
	{
		pattern: "llama4-scout",
		metadata: { contextLength: 10485760, maxOutputTokens: 16384, supportsThinking: false },
	},
	{
		pattern: "llama3-3-70b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-2-90b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-2-11b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-2-3b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-2-1b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-1-405b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-1-70b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-1-8b",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "llama3-70b",
		metadata: { contextLength: 8192, maxOutputTokens: 2048, supportsThinking: false },
	},
	{
		pattern: "llama3-8b",
		metadata: { contextLength: 8192, maxOutputTokens: 2048, supportsThinking: false },
	},

	// Mistral
	{
		pattern: "mistral-large-2",
		metadata: { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: false },
	},
	{
		pattern: "mistral-large",
		metadata: { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: false },
	},
	{
		pattern: "mistral-small",
		metadata: { contextLength: 32000, maxOutputTokens: 8192, supportsThinking: false },
	},
	{
		pattern: "mixtral-8x7b",
		metadata: { contextLength: 32000, maxOutputTokens: 4096, supportsThinking: false },
	},

	// Amazon Nova
	{
		pattern: "nova-pro",
		metadata: { contextLength: 300000, maxOutputTokens: 5120, supportsThinking: false },
	},
	{
		pattern: "nova-premier",
		metadata: { contextLength: 1000000, maxOutputTokens: 5120, supportsThinking: true },
	},
	{
		pattern: "nova-lite",
		metadata: { contextLength: 300000, maxOutputTokens: 5120, supportsThinking: false },
	},
	{
		pattern: "nova-micro",
		metadata: { contextLength: 128000, maxOutputTokens: 5120, supportsThinking: false },
	},

	// DeepSeek
	{
		pattern: "deepseek-r1",
		metadata: { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: true },
	},

	// Cohere
	{
		pattern: "command-r-plus",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "command-r",
		metadata: { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "command-light",
		metadata: { contextLength: 4096, maxOutputTokens: 4096, supportsThinking: false },
	},

	// AI21
	{
		pattern: "jamba-1-5-large",
		metadata: { contextLength: 256000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "jamba-1-5-mini",
		metadata: { contextLength: 256000, maxOutputTokens: 4096, supportsThinking: false },
	},
	{
		pattern: "jamba-instruct",
		metadata: { contextLength: 256000, maxOutputTokens: 4096, supportsThinking: false },
	},
];

/** Default metadata for models not found in the static list. */
const DEFAULT_METADATA: ModelMetadata = {
	contextLength: 200000,
	maxOutputTokens: 4096,
	supportsThinking: false,
};

/**
 * Normalize a Bedrock model ID for matching.
 * Strips region prefixes like "us.", "eu.", "ap.", etc.
 */
function normalizeModelId(modelId: string): string {
	return modelId
		.replace(/^(us|eu|ap|apac|global)\./i, "")
		.toLowerCase();
}

/**
 * Get metadata for a Bedrock model by ID.
 * Uses prefix matching against the static metadata list.
 * Returns default values for unknown models and flags the miss.
 */
export function getModelMetadata(modelId: string): ModelMetadata & { isDefault: boolean } {
	const normalized = normalizeModelId(modelId);

	for (const entry of MODEL_METADATA) {
		if (normalized.includes(entry.pattern)) {
			return { ...entry.metadata, isDefault: false };
		}
	}

	return { ...DEFAULT_METADATA, isDefault: true };
}
