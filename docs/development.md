# Development

## Setup

```bash
git clone https://github.com/ciotlos/bedrock-vscode-copilot
cd bedrock-vscode-copilot
npm install
npm run compile
```

Press F5 in VS Code to launch an Extension Development Host.

## Scripts

| Script | Purpose |
|---|---|
| `npm run compile` | Build TypeScript |
| `npm run watch` | Watch mode (auto-rebuild on changes) |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm test` | Compile and run tests in VS Code test host |
| `npm run vscode:prepublish` | Build for packaging |

## Testing

Tests run inside a VS Code extension host via `@vscode/test-cli`:

- **Unit tests** (`src/test/provider.test.ts`): Message conversion, tool conversion, validation, token estimation, tool buffer
- **Integration tests** (`src/test/integration.test.ts`): End-to-end with real Bedrock API (requires `AWS_BEARER_TOKEN_BEDROCK` in `.env`)

To run integration tests, create a `.env` file in the project root:

```
AWS_BEARER_TOKEN_BEDROCK=bedrock-api-key-xxxxx
```

## Project Structure

```
src/
├── extension.ts                    # Entry point
├── clients/
│   └── bedrock.client.ts           # AWS SDK wrapper
├── commands/
│   └── manage-settings.ts          # Interactive settings command
├── converters/
│   ├── messages.ts                 # VS Code → Bedrock message conversion
│   ├── schema.ts                   # JSON schema sanitization
│   └── tools.ts                    # VS Code → Bedrock tool conversion
├── data/
│   └── model-metadata.ts           # Static model token limits & capabilities
├── providers/
│   ├── bedrock-chat.provider.ts    # Main LanguageModelChatProvider
│   ├── chat-request.handler.ts     # Request handling, retry, streaming
│   └── token.estimator.ts          # Token count estimation
├── services/
│   ├── authentication.service.ts   # Credential resolution
│   ├── cache.service.ts            # Generic TTL cache
│   ├── configuration.service.ts    # VS Code settings + SecretStorage
│   └── model.service.ts            # Model listing & metadata
├── stream-processor.ts             # ConverseStream event processing
├── tool-buffer.ts                  # Tool call accumulation & dedup
├── logger.ts                       # Output channel logger with redaction
├── profiles.ts                     # Model capability profiles
├── types.ts                        # Shared type definitions
└── validation.ts                   # Request validation
```

## Limitations

- Some models don't support streaming with tool calls simultaneously
- Rate limits apply based on your AWS account settings
- Token limits for models are bundled as static metadata and updated with extension releases
- Prompt caching is not yet implemented (planned for a future release)
