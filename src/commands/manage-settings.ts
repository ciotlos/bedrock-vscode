import * as vscode from "vscode";
import type { AuthMethod } from "../types";
import { ConfigurationService } from "../services/configuration.service";

const REGIONS = [
	"us-east-1",
	"us-east-2",
	"us-west-2",
	"ap-south-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"sa-east-1",
];

/**
 * Determine the appropriate configuration target.
 * Uses Workspace scope when a workspace is open, Global otherwise.
 */
function getConfigTarget(): vscode.ConfigurationTarget {
	return vscode.workspace.workspaceFolders?.length
		? vscode.ConfigurationTarget.Workspace
		: vscode.ConfigurationTarget.Global;
}

export async function manageSettings(
	configService: ConfigurationService
): Promise<void> {
	const config = vscode.workspace.getConfiguration('languageModelChatProvider.bedrock');
	const existingRegion = config.get<string>("region") ?? "us-east-1";
	const existingAuthMethod = config.get<AuthMethod>("authMethod") ?? "default";

	const action = await vscode.window.showQuickPick(
		[
			{ label: "Set Authentication Method", value: "auth-method", description: `Current: ${existingAuthMethod}` },
			{ label: "Set Region", value: "region", description: `Current: ${existingRegion}` },
			{ label: "Clear Settings", value: "clear" },
		],
		{
			title: "Manage AWS Bedrock Provider",
			placeHolder: "Choose an action",
		}
	);

	if (!action) {
		return;
	}

	if (action.value === "auth-method") {
		await handleAuthMethodSelection(configService);
	} else if (action.value === "region") {
		const region = await vscode.window.showQuickPick(REGIONS, {
			title: "AWS Bedrock Region",
			placeHolder: `Current: ${existingRegion}`,
			ignoreFocusOut: true,
		});
		if (region) {
			await config.update("region", region, getConfigTarget());
			vscode.window.showInformationMessage(`AWS Bedrock region set to ${region}.`);
		}
	} else if (action.value === "clear") {
		await clearAllSettings(configService);
		vscode.window.showInformationMessage("AWS Bedrock settings cleared.");
	}
}

async function handleAuthMethodSelection(configService: ConfigurationService): Promise<void> {
	const method = await vscode.window.showQuickPick(
		[
			{ label: "API Key", value: "api-key", description: "Use AWS Bedrock API key (Bearer Token)" },
			{ label: "AWS Profile", value: "profile", description: "Use AWS profile from ~/.aws/credentials" },
			{ label: "Access Keys", value: "access-keys", description: "Use AWS access key ID and secret" },
			{ label: "Default", value: "default", description: "Use default AWS credential provider chain" },
		],
		{
			title: "Select Authentication Method",
			placeHolder: "Choose how to authenticate with AWS Bedrock",
			ignoreFocusOut: true,
		}
	);

	if (!method) {
		return;
	}

	const config = vscode.workspace.getConfiguration('languageModelChatProvider.bedrock');
	await clearAuthSettings(configService);
	await config.update("authMethod", method.value, getConfigTarget());

	if (method.value === "api-key") {
		await handleApiKeySetup(configService);
	} else if (method.value === "profile") {
		await handleProfileSetup();
	} else if (method.value === "access-keys") {
		await handleAccessKeysSetup(configService);
	} else if (method.value === "default") {
		vscode.window.showInformationMessage("Using default AWS credential provider chain.");
	}
}

async function handleApiKeySetup(configService: ConfigurationService): Promise<void> {
	const apiKey = await vscode.window.showInputBox({
		title: "AWS Bedrock API Key",
		prompt: "Enter your AWS Bedrock API key (starts with 'bedrock-api-key-')",
		ignoreFocusOut: true,
		password: true,
	});

	if (apiKey === undefined) {
		return;
	}

	if (!apiKey.trim()) {
		vscode.window.showWarningMessage("API key cannot be empty.");
		return;
	}

	const trimmed = apiKey.trim();

	// Warn if the key doesn't match the expected Bedrock API key format
	if (!trimmed.startsWith("bedrock-api-key-")) {
		const proceed = await vscode.window.showWarningMessage(
			"This doesn't look like a Bedrock API key (expected prefix 'bedrock-api-key-'). " +
			"Make sure you're not pasting an AWS secret access key here.",
			"Save Anyway",
			"Cancel"
		);
		if (proceed !== "Save Anyway") {
			return;
		}
	}

	await configService.setApiKey(trimmed);
	vscode.window.showInformationMessage("AWS Bedrock API key saved securely.");
}

async function handleProfileSetup(): Promise<void> {
	const profile = await vscode.window.showInputBox({
		title: "AWS Profile",
		prompt: "Enter the AWS profile name from ~/.aws/credentials",
		ignoreFocusOut: true,
		placeHolder: "default",
	});

	if (profile === undefined) {
		return;
	}

	if (!profile.trim()) {
		vscode.window.showWarningMessage("Profile name cannot be empty.");
		return;
	}

	const config = vscode.workspace.getConfiguration('languageModelChatProvider.bedrock');
	await config.update("profile", profile.trim(), getConfigTarget());
	vscode.window.showInformationMessage(`AWS profile set to '${profile.trim()}'.`);
}

async function handleAccessKeysSetup(configService: ConfigurationService): Promise<void> {
	const accessKeyId = await vscode.window.showInputBox({
		title: "AWS Access Key ID",
		prompt: "Enter your AWS access key ID",
		ignoreFocusOut: true,
		password: true,
	});

	if (accessKeyId === undefined) {
		return;
	}

	if (!accessKeyId.trim()) {
		vscode.window.showWarningMessage("Access key ID cannot be empty.");
		return;
	}

	const secretAccessKey = await vscode.window.showInputBox({
		title: "AWS Secret Access Key",
		prompt: "Enter your AWS secret access key",
		ignoreFocusOut: true,
		password: true,
	});

	if (secretAccessKey === undefined) {
		return;
	}

	if (!secretAccessKey.trim()) {
		vscode.window.showWarningMessage("Secret access key cannot be empty.");
		return;
	}

	const sessionToken = await vscode.window.showInputBox({
		title: "AWS Session Token (Optional)",
		prompt: "Enter your AWS session token (leave empty if not needed)",
		ignoreFocusOut: true,
		password: true,
	});

	if (sessionToken === undefined) {
		return;
	}

	await configService.setAccessKeyId(accessKeyId.trim());
	await configService.setSecretAccessKey(secretAccessKey.trim());

	if (sessionToken && sessionToken.trim()) {
		await configService.setSessionToken(sessionToken.trim());
	}

	vscode.window.showInformationMessage("AWS access keys saved securely.");
}

async function clearAuthSettings(configService: ConfigurationService): Promise<void> {
	await configService.deleteAllSecrets();
	const config = vscode.workspace.getConfiguration('languageModelChatProvider.bedrock');
	await config.update("profile", undefined, getConfigTarget());
}

async function clearAllSettings(configService: ConfigurationService): Promise<void> {
	await clearAuthSettings(configService);
	const config = vscode.workspace.getConfiguration('languageModelChatProvider.bedrock');
	await config.update("authMethod", undefined, getConfigTarget());
	await config.update("region", undefined, getConfigTarget());
}
