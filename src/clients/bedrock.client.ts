import { BedrockClient as AWSBedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock";
import {
	BedrockRuntimeClient,
	ConverseStreamCommand,
	ConverseStreamCommandInput,
	ConverseStreamOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import type { BedrockModelSummary } from "../types";
import { logger } from "../logger";

/** Timeout for streaming responses (5 minutes). AWS recommends ≥60s for Bedrock. */
const STREAMING_REQUEST_TIMEOUT_MS = 300_000;
/** Timeout for control-plane calls like ListFoundationModels (30 seconds). */
const CONTROL_PLANE_REQUEST_TIMEOUT_MS = 30_000;
/** Timeout to establish a TCP connection (10 seconds). */
const CONNECTION_TIMEOUT_MS = 10_000;

/** Environment variable the AWS SDK reads for bearer token auth. */
const BEARER_TOKEN_ENV_KEY = "AWS_BEARER_TOKEN_BEDROCK";

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
	private getControlClient(credentials: CredentialInput): AWSBedrockClient {
		if (this.cachedControlClient && this.cachedRegion === this.region) {
			return this.cachedControlClient;
		}

		this.cachedControlClient = new AWSBedrockClient({
			region: this.region,
			credentials,
			requestHandler: new NodeHttpHandler({
				requestTimeout: CONTROL_PLANE_REQUEST_TIMEOUT_MS,
				connectionTimeout: CONNECTION_TIMEOUT_MS,
			}),
		});
		this.cachedRegion = this.region;
		return this.cachedControlClient;
	}

	/**
	 * Get or create the runtime client (for ConverseStream).
	 */
	private getRuntimeClient(credentials: CredentialInput): BedrockRuntimeClient {
		if (this.cachedRuntimeClient && this.cachedRegion === this.region) {
			return this.cachedRuntimeClient;
		}

		this.cachedRuntimeClient = new BedrockRuntimeClient({
			region: this.region,
			credentials,
			requestHandler: new NodeHttpHandler({
				requestTimeout: STREAMING_REQUEST_TIMEOUT_MS,
				connectionTimeout: CONNECTION_TIMEOUT_MS,
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
				const client = this.getControlClient(credentials);
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
				const client = this.getControlClient(credentials);
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
			const client = this.getRuntimeClient(credentials);
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
