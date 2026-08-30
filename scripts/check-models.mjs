#!/usr/bin/env node
/**
 * Compares live AWS Bedrock foundation models against src/data/model-metadata.ts.
 *
 * Usage:
 *   node scripts/check-models.mjs           # report only; exits 1 if out of sync
 *   node scripts/check-models.mjs --update  # modify model-metadata.ts in place
 *
 * AWS credentials are resolved via the default SDK provider chain
 * (env vars, ~/.aws/credentials, OIDC token, instance profile, …).
 * The only IAM permission required is bedrock:ListFoundationModels.
 */

import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { readFileSync, writeFileSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const METADATA_FILE = join(ROOT, "src", "data", "model-metadata.ts");
const UPDATE = process.argv.includes("--update");
const REGION = process.env.AWS_REGION ?? "us-east-1";
const TODAY = new Date().toISOString().slice(0, 10);

// ── Parse current patterns from the TypeScript source ─────────────────────────

function parsePatterns(src) {
	const result = [];
	const re =
		/\{\s*\n\s*pattern:\s*"([^"]+)",\s*\n\s*metadata:\s*\{\s*contextLength:\s*(\d+),\s*maxOutputTokens:\s*(\d+),\s*supportsThinking:\s*(true|false)\s*\}/g;
	let m;
	while ((m = re.exec(src)) !== null) {
		result.push({
			pattern: m[1],
			contextLength: +m[2],
			maxOutputTokens: +m[3],
			supportsThinking: m[4] === "true",
		});
	}
	return result;
}

// ── Normalise a model ID (mirrors model-metadata.ts logic) ────────────────────

function normalize(modelId) {
	return modelId.replace(/^(us|eu|ap|apac|global)\./i, "").toLowerCase();
}

// ── Best-guess metadata for an unknown model ──────────────────────────────────

function inferMetadata(modelId) {
	const id = normalize(modelId);
	if (id.includes("claude")) {
		if (id.includes("opus") || /sonnet-4\b/.test(id))
			return { contextLength: 200000, maxOutputTokens: 16384, supportsThinking: true };
		if (id.includes("3-7") || id.includes("3-5"))
			return { contextLength: 200000, maxOutputTokens: 8192, supportsThinking: false };
		return { contextLength: 200000, maxOutputTokens: 4096, supportsThinking: false };
	}
	if (/llama4|llama-4/.test(id))
		return { contextLength: 1048576, maxOutputTokens: 16384, supportsThinking: false };
	if (id.includes("llama"))
		return { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false };
	if (id.includes("nova-premier"))
		return { contextLength: 1000000, maxOutputTokens: 5120, supportsThinking: true };
	if (id.includes("nova-pro") || id.includes("nova-lite"))
		return { contextLength: 300000, maxOutputTokens: 5120, supportsThinking: false };
	if (id.includes("nova-micro"))
		return { contextLength: 128000, maxOutputTokens: 5120, supportsThinking: false };
	if (id.includes("mistral") || id.includes("mixtral"))
		return { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: false };
	if (id.includes("deepseek"))
		return { contextLength: 128000, maxOutputTokens: 8192, supportsThinking: id.includes("r1") };
	if (id.includes("command"))
		return { contextLength: 128000, maxOutputTokens: 4096, supportsThinking: false };
	if (id.includes("jamba"))
		return { contextLength: 256000, maxOutputTokens: 4096, supportsThinking: false };
	return { contextLength: 200000, maxOutputTokens: 4096, supportsThinking: false };
}

// ── Derive a compact, reusable pattern from a raw model ID ────────────────────

function derivePattern(modelId) {
	return normalize(modelId)
		.replace(/^(anthropic|meta|amazon|mistral|cohere|ai21|deepseek|writer)\./i, "")
		.replace(/-\d{8}-v\d+:\d+$/, "") // -20250219-v1:0
		.replace(/-instruct-v\d+:\d+$/, "") // -instruct-v1:0
		.replace(/-v\d+:\d+$/, "") // -v1:0
		.replace(/:\d+$/, "") // trailing :0
		.replace(/-v\d+$/, ""); // trailing -v1
}

// ── Provider section header for grouping new entries ──────────────────────────

function sectionHeader(modelId) {
	const id = normalize(modelId);
	if (id.includes("claude")) return "// Anthropic Claude";
	if (id.includes("llama")) return "// Meta Llama";
	if (id.includes("nova")) return "// Amazon Nova";
	if (id.includes("mistral") || id.includes("mixtral")) return "// Mistral";
	if (id.includes("deepseek")) return "// DeepSeek";
	if (id.includes("command")) return "// Cohere";
	if (id.includes("jamba")) return "// AI21";
	return null;
}

// ── Format a new metadata entry block ─────────────────────────────────────────

function formatEntry(pattern, meta, modelName, provider) {
	return (
		`\t// ${provider} - ${modelName} (AUTO-DETECTED ${TODAY} -- verify token limits against AWS docs)\n` +
		`\t{\n` +
		`\t\tpattern: "${pattern}",\n` +
		`\t\tmetadata: { contextLength: ${meta.contextLength}, maxOutputTokens: ${meta.maxOutputTokens}, supportsThinking: ${meta.supportsThinking} },\n` +
		`\t},`
	);
}

// ── Patch the source file ──────────────────────────────────────────────────────

function applyUpdates(src, newModels, stalePatterns) {
	let out = src;

	// Mark stale patterns with a trailing comment (don't remove -- let humans decide)
	for (const p of stalePatterns) {
		const escaped = p.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		out = out.replace(
			new RegExp(`(\\tpattern: "${escaped}",)(?!.*DEPRECATED)`, "g"),
			`$1 // DEPRECATED ${TODAY}: no live Bedrock model matched this pattern -- verify and remove if retired`,
		);
	}

	// Insert new entries into the right provider section
	for (const m of newModels) {
		const pattern = derivePattern(m.modelId);
		const meta = inferMetadata(m.modelId);
		const entry = formatEntry(pattern, meta, m.modelName, m.providerName);
		const header = sectionHeader(m.modelId);

		if (header) {
			const headerIdx = out.indexOf(header);
			if (headerIdx !== -1) {
				// Find the next section header (or closing `];`) to insert before it
				const nextHeaderIdx = out.indexOf("\n\t// ", headerIdx + header.length);
				const closingIdx = out.lastIndexOf("];");
				const insertBefore = nextHeaderIdx !== -1 ? nextHeaderIdx : closingIdx;
				out = out.slice(0, insertBefore) + "\n" + entry + "\n" + out.slice(insertBefore);
				continue;
			}
		}
		// Fallback: insert before the closing `];`
		const closingIdx = out.lastIndexOf("];");
		out = out.slice(0, closingIdx) + "\n\t// Unknown provider\n" + entry + "\n" + out.slice(closingIdx);
	}

	return out;
}

// ── GitHub Actions helpers ─────────────────────────────────────────────────────

function ghSummary(newModels, stalePatterns) {
	if (!process.env.GITHUB_STEP_SUMMARY) return;
	const lines = ["## Bedrock Model Sync\n"];
	if (newModels.length > 0) {
		lines.push(
			`### ⚠ ${newModels.length} new model(s) detected -- best-guess token limits, please verify\n`,
		);
		lines.push("| Model ID | Name | Suggested pattern | Context | Max output | Thinking |");
		lines.push("|---|---|---|---|---|---|");
		for (const m of newModels) {
			const g = inferMetadata(m.modelId);
			lines.push(
				`| \`${m.modelId}\` | ${m.modelName} | \`${derivePattern(m.modelId)}\` | ${g.contextLength.toLocaleString()} | ${g.maxOutputTokens.toLocaleString()} | ${g.supportsThinking} |`,
			);
		}
		lines.push("");
	}
	if (stalePatterns.length > 0) {
		lines.push(
			`### ✗ ${stalePatterns.length} stale pattern(s) -- no live Bedrock model matched\n`,
		);
		lines.push("| Pattern |");
		lines.push("|---|");
		for (const p of stalePatterns) lines.push(`| \`${p.pattern}\` |`);
		lines.push("");
	}
	if (newModels.length === 0 && stalePatterns.length === 0) {
		lines.push("✅ `model-metadata.ts` is in sync with live Bedrock models.");
	}
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

function ghOutput(newModels, stalePatterns) {
	if (!process.env.GITHUB_OUTPUT) return;
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		[
			`new_count=${newModels.length}`,
			`stale_count=${stalePatterns.length}`,
			`has_changes=${newModels.length > 0 || stalePatterns.length > 0}`,
		].join("\n") + "\n",
	);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const src = readFileSync(METADATA_FILE, "utf8");
	const patterns = parsePatterns(src);
	console.log(`Loaded ${patterns.length} patterns from model-metadata.ts`);

	const client = new BedrockClient({ region: REGION });
	const { modelSummaries = [] } = await client.send(new ListFoundationModelsCommand({}));

	// Only care about models users can actually invoke: streaming + TEXT output
	const liveModels = modelSummaries.filter(
		(m) => m.responseStreamingSupported && (m.outputModalities ?? []).includes("TEXT"),
	);
	console.log(`Found ${liveModels.length} streaming text models in Bedrock (${REGION})`);

	const newModels = liveModels.filter(
		(m) => !patterns.some((p) => normalize(m.modelId ?? "").includes(p.pattern)),
	);
	const stalePatterns = patterns.filter(
		(p) => !liveModels.some((m) => normalize(m.modelId ?? "").includes(p.pattern)),
	);

	if (newModels.length === 0 && stalePatterns.length === 0) {
		console.log("✓ model-metadata.ts is in sync.");
		ghSummary(newModels, stalePatterns);
		ghOutput(newModels, stalePatterns);
		process.exit(0);
	}

	if (newModels.length > 0) {
		console.log(`\n⚠ NEW models (${newModels.length}) -- no pattern in model-metadata.ts:`);
		for (const m of newModels) {
			const g = inferMetadata(m.modelId ?? "");
			console.log(`  + ${m.modelId} (${m.modelName})`);
			console.log(
				`    pattern="${derivePattern(m.modelId ?? "")}"  context=${g.contextLength}  output=${g.maxOutputTokens}  thinking=${g.supportsThinking}`,
			);
		}
	}
	if (stalePatterns.length > 0) {
		console.log(`\n✗ STALE patterns (${stalePatterns.length}) -- no live Bedrock model matches:`);
		for (const p of stalePatterns) console.log(`  - "${p.pattern}"`);
	}

	ghSummary(newModels, stalePatterns);
	ghOutput(newModels, stalePatterns);

	if (UPDATE) {
		const patched = applyUpdates(src, newModels, stalePatterns);
		writeFileSync(METADATA_FILE, patched, "utf8");
		console.log(
			`\n✓ Updated ${METADATA_FILE} (${newModels.length} added, ${stalePatterns.length} marked deprecated)`,
		);
	} else {
		// In report-only mode: non-zero exit so CI can catch drift
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
