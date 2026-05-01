import * as vscode from "vscode";
import { BedrockChatProvider } from "./providers/bedrock-chat.provider";
import { ConfigurationService } from "./services/configuration.service";
import { AuthenticationService } from "./services/authentication.service";
import { manageSettings } from "./commands/manage-settings";
import { logger } from "./logger";

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("AWS Bedrock");
	logger.initialize(outputChannel, context.extensionMode);

	context.subscriptions.push(outputChannel);

	const configService = new ConfigurationService();
	configService.setSecretStorage(context.secrets);
	const authService = new AuthenticationService(configService);
	const provider = new BedrockChatProvider(configService, authService);

	const providerDisposable = vscode.lm.registerLanguageModelChatProvider("bedrock", provider);
	context.subscriptions.push(providerDisposable);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('languageModelChatProvider.bedrock')) {
				provider.handleConfigurationChange();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bedrock.manage", async () => {
			await manageSettings(configService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bedrock.configure", async () => {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'languageModelChatProvider.bedrock');
		})
	);
}

export function deactivate() {
	// Clean up any residual bearer token from process.env
	delete process.env.AWS_BEARER_TOKEN_BEDROCK;
}
