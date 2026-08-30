import type { LanguageModelChatInformation } from "vscode";
import * as vscode from "vscode";
import { BedrockClient } from "../clients/bedrock.client";
import { getModelMetadata } from "../data/model-metadata";
import { logger } from "../logger";
import type { BedrockMessage, BedrockModelSummary, ManualModel } from "../types";
import type { AuthenticationService } from "./authentication.service";
import type { ConfigurationService } from "./configuration.service";

/**
 * The broad geographic inference-profile prefix for a source region
 * (`us.`, `eu.`, `apac.`). AWS groups every ap-* region under the `apac.` geo.
 */
export function regionGeoPrefix(region: string): string {
	return region.startsWith("ap-") ? "apac." : `${region.split("-")[0]}.`;
}

/**
 * Resolve the target to invoke for a bare model ID.
 * Order: user override → the region's own geo pool → any other in-region pool →
 * the worldwide `global.` pool → bare ID (undefined).
 *
 * Preferring any in-region pool over `global.` keeps single-country data-residency
 * pools (e.g. `au.`, `jp.`) from being silently widened to all commercial Regions.
 * Pure (no I/O) so routing is unit-testable without a live Bedrock call.
 */
export function resolveInvocationTarget(
	modelId: string,
	availableProfileIds: Set<string>,
	region: string,
	overrides: Record<string, string>
): string | undefined {
	const override = overrides[modelId];
	if (override) {
		return override;
	}
	const candidates = [...availableProfileIds].filter((pid) => pid.endsWith(`.${modelId}`));
	const geo = regionGeoPrefix(region);
	return (
		candidates.find((pid) => pid.startsWith(geo)) ??
		candidates.find((pid) => !pid.startsWith("global.")) ??
		candidates.find((pid) => pid.startsWith("global.")) ??
		candidates[0]
	);
}

/**
 * Convert a user-declared ManualModel into the BedrockModelSummary shape the
 * rest of the pipeline expects. Manual models are assumed streaming + TEXT so
 * they survive the capability filter; vision is opt-in.
 */
export function manualModelToSummary(mm: ManualModel): BedrockModelSummary {
	return {
		modelArn: "",
		modelId: mm.id,
		modelName: mm.name ?? mm.id,
		providerName: mm.id.split(".")[0] || "Bedrock",
		inputModalities: mm.vision ? ["TEXT", "IMAGE"] : ["TEXT"],
		outputModalities: ["TEXT"],
		responseStreamingSupported: true,
		customizationsSupported: [],
		inferenceTypesSupported: ["INFERENCE_PROFILE"],
		modelLifecycle: { status: "ACTIVE" },
	};
}

/**
 * Manages model information, capabilities, and metadata.
 * Uses static bundled metadata for model properties (context length, output tokens, thinking support).
 */
export class ModelService {
	private bedrockClient: BedrockClient;

	/**
	 * Maps a bare model ID to the actual target to use at invocation time
	 * (user override ARN or system inference profile ID). The public model ID
	 * stays bare so capability detection (getModelProfile, getModelMetadata) works.
	 */
	private invocationTargets = new Map<string, string>();

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
	async getLanguageModelChatInformation(silent = false): Promise<LanguageModelChatInformation[]> {
		const authConfig = await this.authService.getAuthConfig(silent);
		if (!authConfig) {
			return [];
		}

		const region = this.configService.getRegion();
		this.bedrockClient.setRegion(region);

		const manualModels = this.configService.getManualModels();

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
			// If the user has declared models manually, fall back to those rather than
			// failing outright — keeps the extension usable when model listing is blocked.
			if (manualModels.length === 0) {
				if (!silent) {
					vscode.window.showErrorMessage(`Failed to fetch Bedrock models: ${errorMsg}`);
				}
				return [];
			}
			logger.log(
				`[Model Service] Model listing unavailable; falling back to ${manualModels.length} manually configured model(s).`
			);
			models = [];
			availableProfileIds = new Set<string>();
		}

		// Merge manually-declared models with discovered ones (by bare model ID).
		// Manual entries fill gaps without clobbering discovered metadata.
		const manualById = new Map(manualModels.map((mm) => [mm.id, mm]));
		if (manualModels.length > 0) {
			const discovered = new Set(models.map((m) => m.modelId));
			for (const mm of manualModels) {
				if (!discovered.has(mm.id)) {
					models.push(manualModelToSummary(mm));
				}
			}
		}

		// Build the overrides map. A manual model's inferenceProfile acts like an
		// implicit override; explicit inferenceProfileOverrides still win.
		const overrides: Record<string, string> = { ...this.configService.getInferenceProfileOverrides() };
		for (const mm of manualModels) {
			if (mm.inferenceProfile && !(mm.id in overrides)) {
				overrides[mm.id] = mm.inferenceProfile;
			}
		}

		const infos: LanguageModelChatInformation[] = [];
		this.invocationTargets.clear();

		for (const m of models) {
			if (!m.responseStreamingSupported || !m.outputModalities.includes("TEXT")) {
				continue;
			}

			// Resolve where to actually send the request. The model.id stays bare so
			// capability detection (temperature, thinking) is unaffected by profile prefixes.
			const invocationTarget = resolveInvocationTarget(m.modelId, availableProfileIds, region, overrides);
			if (invocationTarget) {
				this.invocationTargets.set(m.modelId, invocationTarget);
			}

			const hasInferenceProfile = this.invocationTargets.has(m.modelId);

			// Get model properties from static metadata. Manual overrides take precedence.
			const manual = manualById.get(m.modelId);
			const metadata = getModelMetadata(m.modelId);
			const maxInputTokens = manual?.maxInputTokens ?? metadata.contextLength;
			const maxOutputTokens = manual?.maxOutputTokens ?? metadata.maxOutputTokens;
			const vision = m.inputModalities.includes("IMAGE");

			if (metadata.isDefault && !manual?.maxInputTokens) {
				logger.warn(
					`[Model Service] No static metadata for model "${m.modelId}" (${m.modelName}). ` +
						`Using defaults: ${metadata.contextLength} context, ${metadata.maxOutputTokens} max output. ` +
						`Update src/data/model-metadata.ts to add this model.`
				);
			}

			const modelInfo: LanguageModelChatInformation = {
				id: invocationTarget ?? m.modelId,
				name: m.modelName,
				tooltip: `AWS Bedrock - ${m.providerName}${hasInferenceProfile ? " (Cross-Region)" : ""}${metadata.isDefault && !manual?.maxInputTokens ? " (unverified token limits)" : ""}`,
				detail: `${m.providerName} • ${hasInferenceProfile ? "Multi-Region" : region}`,
				family: "bedrock",
				version: "1.0.0",
				maxInputTokens,
				maxOutputTokens,
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

	/**
	 * Get the invocation target (override ARN or system profile ID) for a bare model ID.
	 * Returns undefined if the model should be invoked with its bare ID directly.
	 */
	getInvocationTarget(bareModelId: string): string | undefined {
		return this.invocationTargets.get(bareModelId);
	}

	/**
	 * Count tokens for messages using the model's native Bedrock tokenizer.
	 * Returns undefined when auth is unavailable or CountTokens is not supported.
	 */
	async countTokens(modelId: string, messages: BedrockMessage[]): Promise<number | undefined> {
		const authConfig = await this.authService.getAuthConfig(true);
		if (!authConfig) {
			return undefined;
		}
		const credentials = this.authService.getCredentials(authConfig);
		const bearerToken = this.authService.getBearerToken(authConfig);
		// Cast: BedrockMessage is structurally compatible with the SDK Message type;
		// the local alias exists only to avoid pulling all SDK types into every file.
		return this.bedrockClient.countTokens(
			credentials,
			modelId,
			messages as import("@aws-sdk/client-bedrock-runtime").Message[],
			bearerToken
		);
	}
}
