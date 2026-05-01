import * as vscode from "vscode";
import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatRequestHandleOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";
import { ConverseStreamCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient } from "../clients/bedrock.client";
import { StreamProcessor } from "../stream-processor";
import { convertMessages } from "../converters/messages";
import { convertTools } from "../converters/tools";
import { validateRequest } from "../validation";
import { logger } from "../logger";
import { ModelService } from "../services/model.service";
import { AuthenticationService } from "../services/authentication.service";
import { ConfigurationService } from "../services/configuration.service";
import { TokenEstimator } from "./token.estimator";

/** Maximum number of retries for transient errors. */
const MAX_RETRIES = 1;
/** Delay in ms before retrying a transient error. */
const RETRY_DELAY_MS = 1000;

/**
 * Check if an error is retryable (transient network/throttling issues).
 */
function isRetryable(err: Error): boolean {
	const name = err.name ?? "";
	const message = err.message ?? "";
	const combined = `${name} ${message}`.toLowerCase();

	// AWS throttling
	if (name === "ThrottlingException" || name === "TooManyRequestsException") {
		return true;
	}

	// HTTP 5xx from AWS
	if (name === "InternalServerException" || name === "ServiceUnavailableException") {
		return true;
	}

	// Network-level transient errors
	if (combined.includes("econnreset") || combined.includes("etimedout") || combined.includes("epipe")) {
		return true;
	}

	// SDK timeout
	if (name === "TimeoutError" || combined.includes("socket hang up")) {
		return true;
	}

	return false;
}

/**
 * Execute a function with retry logic for transient errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < maxRetries && isRetryable(lastError)) {
				logger.warn(
					`[Chat Request Handler] Attempt ${attempt + 1} failed with retryable error, retrying in ${RETRY_DELAY_MS}ms...`,
					lastError.name,
					lastError.message
				);
				await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
				continue;
			}
			throw lastError;
		}
	}
	throw lastError;
}

/**
 * Classify a message part into a type string for logging.
 */
function classifyPart(p: unknown): string {
	if (p instanceof vscode.LanguageModelTextPart) {
		return 'text';
	}
	if (p instanceof vscode.LanguageModelToolCallPart) {
		return 'toolCall';
	}
	if (typeof p === 'object' && p !== null && 'mimeType' in p) {
		const mimed = p as { mimeType?: string };
		if (mimed.mimeType?.startsWith('image/')) {
			return 'image';
		}
	}
	return 'toolResult';
}

/**
 * Handles chat request processing for Bedrock models.
 * Coordinates message conversion, validation, and streaming.
 */
export class ChatRequestHandler {
	private bedrockClient: BedrockClient;
	private streamProcessor: StreamProcessor;
	private tokenEstimator: TokenEstimator;

	constructor(
		private readonly modelService: ModelService,
		private readonly authService: AuthenticationService,
		private readonly configService: ConfigurationService
	) {
		const region = this.configService.getRegion();
		this.bedrockClient = new BedrockClient(region);
		this.streamProcessor = new StreamProcessor();
		this.tokenEstimator = new TokenEstimator();
	}

	/**
	 * Handle configuration changes
	 */
	handleConfigurationChange(): void {
		const region = this.configService.getRegion();
		this.bedrockClient.setRegion(region);
	}

	/**
	 * Process a chat request and stream the response
	 */
	async handleChatRequest(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatMessage[],
		options: LanguageModelChatRequestHandleOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken
	): Promise<void> {
		const trackingProgress: Progress<LanguageModelResponsePart> = {
			report: (part) => {
				try {
					progress.report(part);
				} catch (e) {
					logger.error("[Chat Request Handler] Progress.report failed", {
						modelId: model.id,
						error: e instanceof Error ? { name: e.name, message: e.message } : String(e),
					});
				}
			},
		};

		// Wire cancellation token to an AbortController so cancellation
		// aborts the underlying HTTP request, not just the loop check.
		const abortController = new AbortController();
		const cancellationDisposable = token.onCancellationRequested(() => {
			abortController.abort();
		});

		try {
			const authConfig = await this.authService.getAuthConfig();
			if (!authConfig) {
				throw new Error("Bedrock authentication not configured");
			}

			logger.log("[Chat Request Handler] Converting messages, count:", messages.length);
			messages.forEach((msg, idx) => {
				const partTypes = msg.content.map(p => classifyPart(p));
				logger.log(`[Chat Request Handler] Message ${idx} (${msg.role}):`, partTypes);
			});

			const converted = convertMessages(messages, model.id);
			validateRequest(messages);

			logger.log("[Chat Request Handler] Converted to Bedrock messages:", converted.messages.length);
			converted.messages.forEach((msg, idx) => {
				const contentTypes = msg.content.map(c => {
					if ('text' in c) { return 'text'; }
					if ('image' in c) { return 'image'; }
					if ('toolUse' in c) { return 'toolUse'; }
					return 'toolResult';
				});
				logger.log(`[Chat Request Handler] Bedrock message ${idx} (${msg.role}):`, contentTypes);
			});

			const toolConfig = convertTools(options, model.id);

			if (options.tools && options.tools.length > 128) {
				throw new Error("Cannot have more than 128 tools per request.");
			}

			const inputTokenCount = this.tokenEstimator.estimateMessagesTokens(messages);
			const toolTokenCount = this.tokenEstimator.estimateToolTokens(toolConfig);
			const tokenLimit = Math.max(1, model.maxInputTokens);
			if (inputTokenCount + toolTokenCount > tokenLimit) {
				logger.error("[Chat Request Handler] Message exceeds token limit", {
					total: inputTokenCount + toolTokenCount,
					tokenLimit,
				});
				throw new Error("Message exceeds token limit.");
			}

			// Check if thinking is configured and model supports it
			const thinkingConfig = this.configService.getThinkingConfig();
			const supportsThinking = thinkingConfig ? this.modelService.supportsThinking(model.id) : false;

			const requestInput: ConverseStreamCommandInput = {
				modelId: model.id,
				messages: converted.messages as ConverseStreamCommandInput["messages"],
				inferenceConfig: {
					maxTokens: Math.min(options.modelOptions?.max_tokens || 4096, model.maxOutputTokens),
					// Temperature must be 1.0 when thinking is enabled, otherwise use user preference or default
					temperature: (thinkingConfig && supportsThinking) ? 1.0 : (options.modelOptions?.temperature ?? 0.7),
				},
			};

			if (converted.system.length > 0) {
				requestInput.system = converted.system as ConverseStreamCommandInput["system"];
			}

			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.top_p === "number") {
					requestInput.inferenceConfig!.topP = mo.top_p;
				}
				if (typeof mo.stop === "string") {
					requestInput.inferenceConfig!.stopSequences = [mo.stop];
				} else if (Array.isArray(mo.stop)) {
					requestInput.inferenceConfig!.stopSequences = mo.stop as string[];
				}
			}

			if (toolConfig) {
				requestInput.toolConfig = toolConfig as ConverseStreamCommandInput["toolConfig"];
			}

			if (thinkingConfig && supportsThinking) {
				requestInput.additionalModelRequestFields = {
					...((requestInput.additionalModelRequestFields as Record<string, unknown>) ?? {}),
					thinking: thinkingConfig,
				};
				logger.log("[Chat Request Handler] Extended thinking enabled with budget:", thinkingConfig.budget_tokens);
			}

			logger.log("[Chat Request Handler] Starting streaming request");
			const credentials = this.authService.getCredentials(authConfig);
			const bearerToken = this.authService.getBearerToken(authConfig);

			// Wrap the streaming call in retry logic for transient errors
			await withRetry(async () => {
				const stream = await this.bedrockClient.startConversationStream(
					credentials,
					requestInput,
					abortController.signal,
					bearerToken
				);

				logger.log("[Chat Request Handler] Processing stream events");
				await this.streamProcessor.processStream(stream, trackingProgress, token);
				logger.log("[Chat Request Handler] Finished processing stream");
			});
		} catch (err) {
			// Don't log abort errors as failures — they're expected on cancellation
			if (abortController.signal.aborted) {
				logger.log("[Chat Request Handler] Request cancelled by user");
				return;
			}

			const errorDetail = err instanceof Error ? { name: err.name, message: err.message } : String(err);
			logger.error("[Chat Request Handler] Chat request failed", {
				modelId: model.id,
				messageCount: messages.length,
				error: errorDetail,
			});
			const userMsg = err instanceof Error ? err.name : "Unknown error";
			vscode.window.showErrorMessage(`Bedrock chat request failed: ${userMsg}. Check the "Bedrock Chat" output channel for details.`);
			throw err;
		} finally {
			cancellationDisposable.dispose();
		}
	}
}
