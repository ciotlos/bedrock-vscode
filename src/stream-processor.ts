import type { ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime";
import * as vscode from "vscode";
import { logger } from "./logger";
import { ToolCallBufferManager } from "./tool-buffer";

export class StreamProcessor {
	private toolBuffer: ToolCallBufferManager;

	constructor() {
		this.toolBuffer = new ToolCallBufferManager();
	}

	async processStream(
		stream: AsyncIterable<ConverseStreamOutput>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		this.toolBuffer.reset();

		try {
			for await (const event of stream) {
				if (token.isCancellationRequested) {
					break;
				}

				if (event.contentBlockStart) {
					const idx = event.contentBlockStart.contentBlockIndex ?? 0;
					const start = event.contentBlockStart.start;

					const toolUse = start?.toolUse;

					if (toolUse) {
						if (this.toolBuffer.shouldAddSpaceBeforeFirstTool()) {
							progress.report(new vscode.LanguageModelTextPart(" "));
						}
						this.toolBuffer.startToolCall(idx, toolUse.toolUseId || "", toolUse.name || "");
						this.toolBuffer.markFirstToolEmitted();
					}
				} else if (event.contentBlockDelta) {
					const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
					const delta = event.contentBlockDelta.delta;

					// Handle thinking content (Bedrock uses 'reasoningContent' not 'thinking')
					if (delta?.reasoningContent?.text) {
						const thinkingText = delta.reasoningContent.text;
						// Emit thinking part directly - LanguageModelThinkingPart is enabled via package.json
						try {
							// biome-ignore lint/suspicious/noExplicitAny: proposed VS Code API not yet in stable types
							const ThinkingPart = (vscode as any).LanguageModelThinkingPart;
							if (ThinkingPart) {
								progress.report(new ThinkingPart(thinkingText));
							}
						} catch (e) {
							logger.warn("[StreamProcessor] LanguageModelThinkingPart not available", e);
						}
					}

					if (delta?.text) {
						progress.report(new vscode.LanguageModelTextPart(delta.text));
						if (delta.text.length > 0) {
							this.toolBuffer.markHasText();
						}
					}

					if (delta?.toolUse?.input) {
						this.toolBuffer.appendArgs(idx, delta.toolUse.input);
						await this.toolBuffer.tryEmit(idx, progress);
					}
				} else if (event.contentBlockStop) {
					const idx = event.contentBlockStop.contentBlockIndex ?? 0;
					await this.toolBuffer.tryEmit(idx, progress, true);
				} else if (event.messageStop) {
					await this.toolBuffer.emitAll(progress);
				}
			}
		} finally {
			this.toolBuffer.reset();
		}
	}
}
