import {
	BedrockClient as AWSBedrockClient,
	ListFoundationModelsCommand,
	ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock";
import {
	BedrockRuntimeClient,
	ConverseStreamCommand,
	type ConverseStreamCommandInput,
	type ConverseStreamOutput,
	CountTokensCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { logger } from "../logger";
import type { BedrockModelSummary } from "../types";

/** Timeout for streaming responses (5 minutes). AWS recommends ≥60s for Bedrock. */
const STREAMING_REQUEST_TIMEOUT_MS = 300_000;
/** Timeout for control-plane calls like ListFoundationModels (30 seconds). */
const CONTROL_PLANE_REQUEST_TIMEOUT_MS = 30_000;
/** Timeout to establish a TCP connection (10 seconds). */
const CONNECTION_TIMEOUT_MS = 10_000;

/** Environment variable the AWS SDK reads for bearer token auth. */
const BEARER_TOKEN_ENV_KEY = "AWS_BEARER_TOKEN_BEDROCK";

/**
 * Lazily-loaded proxy agent promise. The https-proxy-agent package (v9+) is
 * ESM-only, so it must be loaded via dynamic import() rather than a static
 * require(). We resolve it once and cache the promise so the import cost is
 * paid at most once per process.
 */
let _proxyAgentP: Promise<import("https").Agent | undefined> | undefined;

/**
 * Return an https.Agent backed by the proxy URL from the environment, or
 * undefined when no proxy is configured.
 * Exported for testing.
 */
export async function getProxyAgent(): Promise<import("https").Agent | undefined> {
	if (_proxyAgentP === undefined) {
		_proxyAgentP = (async () => {
			const proxyUrl =
				process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;
			if (!proxyUrl) {
				return undefined;
			}
			logger.log("[Bedrock Client] Routing requests through proxy:", proxyUrl);
			const { HttpsProxyAgent } = await import("https-proxy-agent");
			return new HttpsProxyAgent(proxyUrl) as unknown as import("https").Agent;
		})();
	}
	return _proxyAgentP;
}

type CredentialInput = AwsCredentialIdentity | Provider<AwsCredentialIdentity> | undefined;

/**
 * Pure AWS Bedrock API client.
 * Handles only AWS SDK interactions, no business logic or caching.
 * Caches SDK clients per region for connection reuse.
 *
 * Bearer token auth: When a bearerToken is provided, it is set in process.env
 * only for the duration of the SDK call and removed immediately after.
 */
export class BedrockClient {
	private region: string;
	private cachedControlClient: AWSBedrockClient | null = null;
	private cachedRuntimeClient: BedrockRuntimeClient | null = null;
	private cachedRegion: string | null = null;

	constructor(region: string) {
		this.region = region;
	}

	setRegion(region: string): void {
		if (region !== this.region) {
			this.region = region;
			this.cachedControlClient = null;
			this.cachedRuntimeClient = null;
			this.cachedRegion = null;
			logger.log("[Bedrock Client] Region changed, SDK clients invalidated");
		}
	}

	/**
	 * Get or create the control-plane client (for ListFoundationModels, ListInferenceProfiles).
	 */
	private async getControlClient(credentials: CredentialInput): Promise<AWSBedrockClient> {
		if (this.cachedControlClient && this.cachedRegion === this.region) {
			return this.cachedControlClient;
		}

		const proxyAgent = await getProxyAgent();
		this.cachedControlClient = new AWSBedrockClient({
			region: this.region,
			credentials,
			requestHandler: new NodeHttpHandler({
				requestTimeout: CONTROL_PLANE_REQUEST_TIMEOUT_MS,
				connectionTimeout: CONNECTION_TIMEOUT_MS,
				...(proxyAgent && { httpsAgent: proxyAgent }),
			}),
		});
		this.cachedRegion = this.region;
		return this.cachedControlClient;
	}

	/**
	 * Get or create the runtime client (for ConverseStream).
	 */
	private async getRuntimeClient(credentials: CredentialInput): Promise<BedrockRuntimeClient> {
		if (this.cachedRuntimeClient && this.cachedRegion === this.region) {
			return this.cachedRuntimeClient;
		}

		const proxyAgent = await getProxyAgent();
		this.cachedRuntimeClient = new BedrockRuntimeClient({
			region: this.region,
			credentials,
			requestHandler: new NodeHttpHandler({
				requestTimeout: STREAMING_REQUEST_TIMEOUT_MS,
				connectionTimeout: CONNECTION_TIMEOUT_MS,
				...(proxyAgent && { httpsAgent: proxyAgent }),
			}),
		});
		this.cachedRegion = this.region;
		return this.cachedRuntimeClient;
	}

	/**
	 * Execute a function with the bearer token scoped to process.env only
	 * for the duration of the call. Cleans up in finally to prevent leaking.
	 */
	private async withScopedBearerToken<T>(bearerToken: string | undefined, fn: () => Promise<T>): Promise<T> {
		if (!bearerToken) {
			return fn();
		}

		const previousValue = process.env[BEARER_TOKEN_ENV_KEY];
		process.env[BEARER_TOKEN_ENV_KEY] = bearerToken;
		try {
			return await fn();
		} finally {
			// Restore previous value or delete
			if (previousValue !== undefined) {
				process.env[BEARER_TOKEN_ENV_KEY] = previousValue;
			} else {
				delete process.env[BEARER_TOKEN_ENV_KEY];
			}
		}
	}

	/**
	 * Fetch foundation models from AWS Bedrock
	 */
	async fetchModels(credentials: CredentialInput, bearerToken?: string): Promise<BedrockModelSummary[]> {
		return this.withScopedBearerToken(bearerToken, async () => {
			try {
				const client = await this.getControlClient(credentials);
				const command = new ListFoundationModelsCommand({});
				const response = await client.send(command);

				return (response.modelSummaries ?? []).map((summary) => ({
					modelArn: summary.modelArn || "",
					modelId: summary.modelId || "",
					modelName: summary.modelName || "",
					providerName: summary.providerName || "",
					inputModalities: summary.inputModalities || [],
					outputModalities: summary.outputModalities || [],
					responseStreamingSupported: summary.responseStreamingSupported || false,
					customizationsSupported: summary.customizationsSupported,
					inferenceTypesSupported: summary.inferenceTypesSupported,
					modelLifecycle: summary.modelLifecycle,
				}));
			} catch (err) {
				logger.error("[Bedrock Client] Failed to fetch Bedrock models", err);
				throw err;
			}
		});
	}

	/**
	 * Fetch inference profiles from AWS Bedrock
	 */
	async fetchInferenceProfiles(credentials: CredentialInput, bearerToken?: string): Promise<Set<string>> {
		return this.withScopedBearerToken(bearerToken, async () => {
			try {
				const client = await this.getControlClient(credentials);
				const command = new ListInferenceProfilesCommand({});
				const response = await client.send(command);

				const profileIds = new Set<string>();
				for (const profile of response.inferenceProfileSummaries ?? []) {
					if (profile.inferenceProfileId) {
						profileIds.add(profile.inferenceProfileId);
					}
				}

				return profileIds;
			} catch (err) {
				logger.error("[Bedrock Client] Failed to fetch inference profiles", err);
				return new Set();
			}
		});
	}

	/**
	 * Count tokens for a set of messages using the model's native tokenizer.
	 * Returns undefined if the model does not support CountTokens or the call fails.
	 */
	async countTokens(
		credentials: CredentialInput,
		modelId: string,
		messages: ConverseStreamCommandInput["messages"],
		bearerToken?: string
	): Promise<number | undefined> {
		return this.withScopedBearerToken(bearerToken, async () => {
			try {
				const client = await this.getRuntimeClient(credentials);
				const command = new CountTokensCommand({
					modelId,
					input: { converse: { messages } },
				});
				const response = await client.send(command);
				return response.inputTokens ?? undefined;
			} catch (err) {
				logger.warn("[Bedrock Client] CountTokens failed, will fall back to estimate:", err);
				return undefined;
			}
		});
	}

	/**
	 * Start a conversation stream with AWS Bedrock.
	 * @param credentials AWS credentials
	 * @param input ConverseStream request input
	 * @param abortSignal Optional signal to abort the request (e.g., on user cancellation)
	 * @param bearerToken Optional bearer token for API key auth (scoped to this call only)
	 */
	async startConversationStream(
		credentials: CredentialInput,
		input: ConverseStreamCommandInput,
		abortSignal?: AbortSignal,
		bearerToken?: string
	): Promise<AsyncIterable<ConverseStreamOutput>> {
		return this.withScopedBearerToken(bearerToken, async () => {
			const client = await this.getRuntimeClient(credentials);
			const command = new ConverseStreamCommand(input);
			const response = await client.send(command, {
				abortSignal,
			});

			if (!response.stream) {
				throw new Error("No stream in response");
			}

			return response.stream;
		});
	}
}
