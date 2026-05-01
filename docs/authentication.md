# Authentication

Four authentication methods are supported, configured via Settings or the "AWS Bedrock: Manage Provider" command.

## 1. AWS Bedrock API Key (Recommended for Quick Start)

Generate a long-term or short-term API key from the [AWS Console](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html):

- **Long-term keys**: Valid for 1-365 days, easy to generate from AWS Console
- **Short-term keys**: Valid for up to 12 hours, generated via Console or Python package
- Format: `bedrock-api-key-[BASE64]`

Set via Command Palette → "AWS Bedrock: Manage Provider" → Set Authentication Method → API Key

The extension validates the key format on input and warns if it doesn't match the expected `bedrock-api-key-` prefix.

## 2. AWS Profile

Use credentials from `~/.aws/credentials` (supports SSO):

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

Set the profile name in Settings → Language Model Chat Provider: Bedrock → Profile.

## 3. AWS Access Keys

Direct AWS access key ID and secret access key. Optionally include a session token for temporary credentials.

All values are stored in VS Code's encrypted SecretStorage, not in settings files.

## 4. Default Credential Provider Chain

Uses the AWS SDK's default credential resolution order:
1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. Shared credentials file (`~/.aws/credentials`)
3. SSO credentials
4. EC2 instance metadata / ECS task role
5. Other SDK-supported providers

This is the best option for environments where credentials are already configured (e.g., EC2, Cloud9, SSO).

## Security Notes

- API keys and access keys are stored in VS Code's **SecretStorage** (OS keychain), not in settings JSON files.
- Bearer tokens for API key auth are set in `process.env` only for the duration of individual SDK calls and cleaned up immediately after.
- The `deactivate()` function cleans up any residual environment variables.
- The logger automatically redacts sensitive values (apiKey, secretAccessKey, token, etc.) from output.
