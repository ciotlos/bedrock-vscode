# AWS Bedrock Provider for GitHub Copilot Chat

Integrates AWS Bedrock foundation models into GitHub Copilot Chat for VS Code.

![Demo](assets/demo.gif)

## Quick Start

1. Install the extension
2. Open Settings (Cmd/Ctrl + ,) and search for "Bedrock"
3. Configure your [authentication method](docs/authentication.md) and AWS region
4. Select a Bedrock model from the model dropdown in GitHub Copilot Chat

## Features

- **Streaming chat** with all Bedrock text models (Claude, Llama, Mistral, Nova, DeepSeek, Cohere, AI21)
- **Tool/function calling** and **vision/image input** for compatible models
- **Extended thinking** for Claude 3.7+, Sonnet 4+, Opus 4+, Nova Premier, DeepSeek R1
- **Cross-region inference profiles** for optimized routing
- **Automatic retry** on transient errors (throttling, network issues)
- **Secure credential storage** via VS Code SecretStorage

## Configuration

| Setting | Description | Default |
|---|---|---|
| Region | AWS region for Bedrock | `us-east-1` |
| Auth Method | `api-key`, `profile`, `access-keys`, or `default` | `default` |
| Enable Extended Thinking | Show model reasoning process | `false` |
| Thinking Budget Tokens | Max tokens for thinking (1024-32768) | `1024` |

**Commands:**
- **AWS Bedrock: Manage Provider** — Interactive setup for auth, region, credentials
- **AWS Bedrock: Open Settings** — Opens VS Code settings

## Documentation

| Topic | Link |
|---|---|
| Architecture & data flow | [docs/architecture.md](docs/architecture.md) |
| Authentication methods | [docs/authentication.md](docs/authentication.md) |
| Models & capabilities | [docs/models.md](docs/models.md) |
| Model metadata maintenance | [docs/model-metadata-maintenance.md](docs/model-metadata-maintenance.md) |
| Development & testing | [docs/development.md](docs/development.md) |

## Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Bedrock API Keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
- [VS Code Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)

## License

MIT
