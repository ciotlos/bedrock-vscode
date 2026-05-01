# Architecture

## Overview

The extension registers as a `languageModelChatProvider` in VS Code, bridging GitHub Copilot Chat to AWS Bedrock's ConverseStream API.

```mermaid
flowchart LR
    subgraph USER["👤 User"]
        direction TB
        Chat["Copilot Chat"]
        Dropdown["Model Picker"]
    end

    subgraph EXT["🧩 Bedrock Extension"]
        direction TB
        Provider["Provider"]
        Handler["Request Handler\n• convert messages\n• validate\n• retry on 429/5xx"]
        Stream["Stream Processor\n• text chunks\n• tool calls\n• thinking parts"]
        Models["Model Service"]
        Auth["Auth Service"]
        Meta["Static Metadata\n(token limits,\nthinking support)"]
    end

    subgraph LOCAL["💾 Local"]
        direction TB
        Settings["VS Code Settings\nregion, auth method"]
        Secrets["SecretStorage 🔒\nAPI key, access keys"]
        AWSCreds["~/.aws/credentials"]
    end

    subgraph AWS["☁️ AWS Bedrock"]
        direction TB
        Control["Control Plane\nListFoundationModels\nListInferenceProfiles"]
        Runtime["Runtime\nConverseStream"]
        LLMs["Foundation Models\nClaude · Llama · Mistral\nNova · DeepSeek"]
    end

    Chat -- "send message" --> Provider
    Dropdown -- "list models" --> Provider

    Provider --> Handler
    Provider --> Models

    Models --> Meta
    Models -- "30s timeout" --> Control
    Handler --> Auth
    Handler -- "5 min timeout" --> Runtime
    Runtime --> LLMs
    Runtime -. "stream chunks" .-> Stream
    Stream -. "text + tools + thinking" .-> Chat

    Auth --> Settings
    Auth --> Secrets
    Auth -.-> AWSCreds

    style AWS fill:#FF9900,stroke:#FF9900,color:#000
    style EXT fill:#264F78,stroke:#3C8CE7,color:#fff
    style USER fill:#1E1E1E,stroke:#555,color:#fff
    style LOCAL fill:#2D2D2D,stroke:#555,color:#fff
```

## Data Flow

| Data | Source | Notes |
|---|---|---|
| Model list (names, IDs, modalities) | **Fetched** from AWS `ListFoundationModels` | On each model picker open |
| Token limits & thinking support | **Bundled** static metadata in extension | AWS doesn't expose these via API |
| Cross-region inference profiles | **Fetched** from AWS `ListInferenceProfiles` | Enables multi-region routing |
| Chat responses | **Streamed** from AWS `ConverseStream` | 5 min timeout, 1 retry on transient errors |
| Credentials | **Local** — VS Code SecretStorage or `~/.aws/` | Encrypted, never in `process.env` globally |
| Settings | **Local** — VS Code settings (workspace or user) | Region, auth method, thinking config |

## Network & Security

- **No third-party calls.** The only outbound traffic goes to AWS Bedrock in your configured region.
- Credentials are stored in VS Code's encrypted SecretStorage, never in `process.env` globally.
- Bearer tokens for API key auth are scoped to individual SDK calls via try/finally.
- The logger redacts sensitive keys (apiKey, secretAccessKey, token, etc.) from output.

## Streaming & Reliability

- **Timeouts**: 5 min for streaming responses, 30s for control plane calls, 10s for TCP connection.
- **Retry**: One automatic retry on transient errors (HTTP 429, 5xx, ECONNRESET, ETIMEDOUT).
- **Cancellation**: VS Code's CancellationToken is wired to an AbortController that aborts the underlying HTTP request immediately.
- **Client caching**: AWS SDK clients are cached per region and reused across calls for connection pooling.

## Key Files

| File | Purpose |
|---|---|
| `src/extension.ts` | Entry point, provider registration, command registration |
| `src/providers/bedrock-chat.provider.ts` | Main provider that implements `LanguageModelChatProvider` |
| `src/providers/chat-request.handler.ts` | Message conversion, validation, retry, streaming orchestration |
| `src/stream-processor.ts` | Processes ConverseStream events into VS Code progress parts |
| `src/clients/bedrock.client.ts` | AWS SDK wrapper with timeout config and bearer token scoping |
| `src/services/model.service.ts` | Model listing, metadata lookup, inference profile resolution |
| `src/services/authentication.service.ts` | Credential resolution for all 4 auth methods |
| `src/data/model-metadata.ts` | Static model metadata (token limits, thinking support) |
| `src/converters/messages.ts` | VS Code message → Bedrock message format conversion |
| `src/converters/tools.ts` | VS Code tool definitions → Bedrock tool config conversion |
