import * as vscode from "vscode";
import type { AuthMethod } from "../types";

const SECRET_KEY_API_KEY = "bedrock.apiKey";
const SECRET_KEY_ACCESS_KEY_ID = "bedrock.accessKeyId";
const SECRET_KEY_SECRET_ACCESS_KEY = "bedrock.secretAccessKey";
const SECRET_KEY_SESSION_TOKEN = "bedrock.sessionToken";

export class ConfigurationService {
	private readonly configSection = 'languageModelChatProvider.bedrock';
	private secretStorage: vscode.SecretStorage | undefined;

	setSecretStorage(storage: vscode.SecretStorage): void {
		this.secretStorage = storage;
	}

	getRegion(): string {
		const config = vscode.workspace.getConfiguration(this.configSection);
		return config.get<string>('region') ?? "us-east-1";
	}

	getAuthMethod(): AuthMethod {
		const config = vscode.workspace.getConfiguration(this.configSection);
		return config.get<AuthMethod>('authMethod') ?? 'default';
	}

	getProfile(): string | undefined {
		const config = vscode.workspace.getConfiguration(this.configSection);
		return config.get<string>('profile');
	}

	isThinkingEnabled(): boolean {
		const config = vscode.workspace.getConfiguration(this.configSection);
		return config.get<boolean>('thinkingEnabled', false);
	}

	getThinkingBudgetTokens(): number {
		const config = vscode.workspace.getConfiguration(this.configSection);
		const budget = config.get<number>('thinkingBudgetTokens', 1024);
		return Math.max(1024, budget);
	}

	getThinkingConfig(): { type: 'enabled' | 'disabled'; budget_tokens?: number } | undefined {
		if (!this.isThinkingEnabled()) {
			return undefined;
		}

		return {
			type: 'enabled',
			budget_tokens: this.getThinkingBudgetTokens(),
		};
	}

	async getApiKey(): Promise<string | undefined> {
		return this.secretStorage?.get(SECRET_KEY_API_KEY);
	}

	async setApiKey(value: string): Promise<void> {
		await this.secretStorage?.store(SECRET_KEY_API_KEY, value);
	}

	async deleteApiKey(): Promise<void> {
		await this.secretStorage?.delete(SECRET_KEY_API_KEY);
	}

	async getAccessKeyId(): Promise<string | undefined> {
		return this.secretStorage?.get(SECRET_KEY_ACCESS_KEY_ID);
	}

	async setAccessKeyId(value: string): Promise<void> {
		await this.secretStorage?.store(SECRET_KEY_ACCESS_KEY_ID, value);
	}

	async deleteAccessKeyId(): Promise<void> {
		await this.secretStorage?.delete(SECRET_KEY_ACCESS_KEY_ID);
	}

	async getSecretAccessKey(): Promise<string | undefined> {
		return this.secretStorage?.get(SECRET_KEY_SECRET_ACCESS_KEY);
	}

	async setSecretAccessKey(value: string): Promise<void> {
		await this.secretStorage?.store(SECRET_KEY_SECRET_ACCESS_KEY, value);
	}

	async deleteSecretAccessKey(): Promise<void> {
		await this.secretStorage?.delete(SECRET_KEY_SECRET_ACCESS_KEY);
	}

	async getSessionToken(): Promise<string | undefined> {
		return this.secretStorage?.get(SECRET_KEY_SESSION_TOKEN);
	}

	async setSessionToken(value: string): Promise<void> {
		await this.secretStorage?.store(SECRET_KEY_SESSION_TOKEN, value);
	}

	async deleteSessionToken(): Promise<void> {
		await this.secretStorage?.delete(SECRET_KEY_SESSION_TOKEN);
	}

	async deleteAllSecrets(): Promise<void> {
		await this.deleteApiKey();
		await this.deleteAccessKeyId();
		await this.deleteSecretAccessKey();
		await this.deleteSessionToken();
	}
}
