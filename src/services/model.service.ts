import * as vscode from "vscode";
import type { LanguageModelChatInformation } from "vscode";
import type { BedrockModelSummary } from "../types";
import { BedrockClient } from "../clients/bedrock.client";
import { getModelMetadata } from "../data/model-metadata";
import { AuthenticationService } from "./authentication.service";
import { ConfigurationService } from "./configuration.service";
import { logger } from "../logger";

/**
 * Manages model information, capabilities, and metadata.
 * Uses static bundled metadata for model properties (context length, output tokens, thinking support).
 */
export class ModelService {
	private bedrockClient: BedrockClient;

	constructor(
		private readonly authService: AuthenticationService,
		private readonly configService: ConfigurationService
	) {
		const region = this.configService.getRegion();
		this.bedrockClient = new BedrockClient(region);
	}

	/**
	 * Handle configuration changes (e.g., region updates)
	 */
	handleConfigurationChange(): void {
		const region = this.configService.getRegion();
		this.bedrockClient.setRegion(region);
		logger.log("[Model Service] Configuration changed, region updated to:", region);
	}

	/**
	 * Fetch and prepare language model chat information
	 */
	async getLanguageModelChatInformation(
		silent = false
	): Promise<LanguageModelChatInformation[]> {
		const authConfig = await this.authService.getAuthConfig(silent);
		if (!authConfig) {
			return [];
		}

		const region = this.configService.getRegion();
		this.bedrockClient.setRegion(region);

		let models: BedrockModelSummary[];
		let availableProfileIds: Set<string>;

		try {
			const credentials = this.authService.getCredentials(authConfig);
			const bearerToken = this.authService.getBearerToken(authConfig);
			[models, availableProfileIds] = await Promise.all([
				this.bedrockClient.fetchModels(credentials, bearerToken),
				this.bedrockClient.fetchInferenceProfiles(credentials, bearerToken),
			]);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error("[Model Service] Failed to fetch models", err);
			if (!silent) {
				vscode.window.showErrorMessage(`Failed to fetch Bedrock models: ${errorMsg}`);
			}
			return [];
		}

		const infos: LanguageModelChatInformation[] = [];
		const regionPrefix = region.split("-")[0];

		for (const m of models) {
			if (!m.responseStreamingSupported || !m.outputModalities.includes("TEXT")) {
				continue;
			}

			const inferenceProfileId = `${regionPrefix}.${m.modelId}`;
			const hasInferenceProfile = availableProfileIds.has(inferenceProfileId);
			const modelIdToUse = hasInferenceProfile ? inferenceProfileId : m.modelId;

			// Get model properties from static metadata
			const metadata = getModelMetadata(modelIdToUse);
			const vision = m.inputModalities.includes("IMAGE");

			const modelInfo: LanguageModelChatInformation = {
				id: modelIdToUse,
				name: m.modelName,
				tooltip: `AWS Bedrock - ${m.providerName}${hasInferenceProfile ? ' (Cross-Region)' : ''}`,
				detail: `${m.providerName} • ${hasInferenceProfile ? 'Multi-Region' : region}`,
				family: "bedrock",
				version: "1.0.0",
				maxInputTokens: metadata.contextLength,
				maxOutputTokens: metadata.maxOutputTokens,
				capabilities: {
					toolCalling: true,
					imageInput: vision,
				},
			};
			infos.push(modelInfo);
		}

		return infos;
	}

	/**
	 * Check if a model supports thinking/reasoning
	 */
	supportsThinking(modelId: string): boolean {
		const thinkingConfig = this.configService.getThinkingConfig();
		if (!thinkingConfig) {
			return false;
		}

		const metadata = getModelMetadata(modelId);
		return metadata.supportsThinking;
	}
}
