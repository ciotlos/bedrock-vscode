/**
 * Static model metadata for known Bedrock models.
 * Replaces the runtime OpenRouter API call with bundled data.
 * Update this file when new models are added to Bedrock.
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
 * Returns default values for unknown models.
 */
export function getModelMetadata(modelId: string): ModelMetadata {
	const normalized = normalizeModelId(modelId);

	for (const entry of MODEL_METADATA) {
		if (normalized.includes(entry.pattern)) {
			return entry.metadata;
		}
	}

	return DEFAULT_METADATA;
}
