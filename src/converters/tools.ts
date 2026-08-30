import * as vscode from "vscode";
import { logger } from "../logger";
import { getModelProfile } from "../profiles";
import type { BedrockToolConfig, BedrockToolSpec } from "../types";
import { sanitizeFunctionName, sanitizeSchema } from "./schema";

export function convertTools(
	options: vscode.LanguageModelChatRequestHandleOptions,
	modelId: string
): BedrockToolConfig | undefined {
	const tools = options.tools ?? [];
	if (!tools || tools.length === 0) {
		return undefined;
	}

	const profile = getModelProfile(modelId);

	const toolSpecs: BedrockToolSpec[] = tools
		.filter((t) => t && typeof t === "object")
		.map((t) => {
			const name = sanitizeFunctionName(t.name);
			const description = typeof t.description === "string" ? t.description : "";
			const params = sanitizeSchema(t.inputSchema ?? { type: "object", properties: {} });
			return {
				name,
				description,
				inputSchema: {
					json: params,
				},
			} satisfies BedrockToolSpec;
		});

	const toolConfig: BedrockToolConfig = {
		tools: toolSpecs.map((spec) => ({ toolSpec: spec })),
	};

	if (profile.supportsToolChoice) {
		if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
			if (tools.length !== 1) {
				logger.error("[Tool Converter] ToolMode.Required but multiple tools:", tools.length);
				throw new Error("LanguageModelChatToolMode.Required is not supported with more than one tool");
			}
			toolConfig.toolChoice = {
				tool: {
					name: sanitizeFunctionName(tools[0].name),
				},
			};
		} else {
			toolConfig.toolChoice = { auto: {} };
		}
	}

	return toolConfig;
}
