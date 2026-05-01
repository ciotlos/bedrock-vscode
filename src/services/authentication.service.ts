import * as vscode from "vscode";
import { fromIni } from "@aws-sdk/credential-providers";
import type { AuthConfig } from "../types";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { ConfigurationService } from "./configuration.service";
import { logger } from "../logger";

export class AuthenticationService {
	constructor(private readonly configService: ConfigurationService) {}

	async getAuthConfig(silent = false): Promise<AuthConfig | undefined> {
		const method = this.configService.getAuthMethod();

		if (method === 'default') {
			return { method: 'default' };
		}

		if (method === 'api-key') {
			const apiKey = await this.configService.getApiKey();
			if (!apiKey && !silent) {
				vscode.window.showInformationMessage(
					'Please configure your AWS Bedrock API Key in settings or run "Configure AWS Bedrock".'
				);
				return undefined;
			}
			if (!apiKey) {
				return undefined;
			}
			return { method: 'api-key', apiKey };
		}

		if (method === 'profile') {
			const profile = this.configService.getProfile();
			if (!profile && !silent) {
				vscode.window.showInformationMessage(
					'Please configure your AWS profile in settings or run "Configure AWS Bedrock".'
				);
				return undefined;
			}
			if (!profile) {
				return undefined;
			}
			return { method: 'profile', profile };
		}

		if (method === 'access-keys') {
			const accessKeyId = await this.configService.getAccessKeyId();
			const secretAccessKey = await this.configService.getSecretAccessKey();
			const sessionToken = await this.configService.getSessionToken();

			if (!accessKeyId || !secretAccessKey) {
				if (!silent) {
					vscode.window.showInformationMessage(
						'Please configure your AWS access keys in settings or run "Configure AWS Bedrock".'
					);
				}
				return undefined;
			}

			return {
				method: 'access-keys',
				accessKeyId,
				secretAccessKey,
				...(sessionToken && { sessionToken }),
			};
		}

		return undefined;
	}

	/**
	 * Get the bearer token for API key auth, if applicable.
	 * Returns undefined for non-api-key auth methods.
	 */
	getBearerToken(authConfig: AuthConfig): string | undefined {
		if (authConfig.method === 'api-key') {
			if (!authConfig.apiKey) {
				throw new Error('API key is required for api-key authentication method');
			}
			return authConfig.apiKey;
		}
		return undefined;
	}

	/**
	 * Get SDK credentials for non-bearer-token auth methods.
	 * For api-key auth, returns undefined (bearer token is handled separately via BedrockClient).
	 */
	getCredentials(authConfig: AuthConfig): AwsCredentialIdentity | Provider<AwsCredentialIdentity> | undefined {
		if (authConfig.method === 'api-key') {
			logger.log("[Authentication Service] Using API key authentication");
			return undefined;
		}

		if (authConfig.method === 'profile') {
			if (!authConfig.profile) {
				throw new Error('Profile name is required for profile authentication method');
			}
			logger.log("[Authentication Service] Using profile authentication:", authConfig.profile);
			return fromIni({ profile: authConfig.profile });
		}

		if (authConfig.method === 'access-keys') {
			if (!authConfig.accessKeyId || !authConfig.secretAccessKey) {
				throw new Error('Access key ID and secret access key are required for access-keys authentication method');
			}
			logger.log("[Authentication Service] Using access keys authentication");
			return {
				accessKeyId: authConfig.accessKeyId,
				secretAccessKey: authConfig.secretAccessKey,
				...(authConfig.sessionToken && { sessionToken: authConfig.sessionToken }),
			};
		}

		logger.log("[Authentication Service] Using default credential provider chain");
		return undefined;
	}
}
