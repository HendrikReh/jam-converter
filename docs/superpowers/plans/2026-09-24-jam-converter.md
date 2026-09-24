# JAM Converter Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Track progress here and in `.superpowers/progress.md`.

**Goal:** Convert local FigJam archives into sourced Mermaid diagrams, Markdown and draft ADRs, with optional explicit AI enrichment.

**Architecture:** A bounded archive reader normalizes native nodes into a source model. A deterministic analyzer and validated local mappings build a semantic model; exporters and an optional OpenAI Responses adapter consume that model.

**Tech Stack:** TypeScript, Node.js >=24, openfig-core, fflate, Zod, node:test, Mermaid, jsdom for parser verification.

**Spec:** `docs/superpowers/specs/2026-09-24-jam-converter-design.md`

## Global Constraints

- Work in `/Users/hendrikreh/Documents/Development/jam-converter`, as explicitly requested.
- No source modification, no implicit network calls, no source content committed.
- Preserve sources, views, ambiguous content and incomplete coverage.
- Source text is data, never instructions or executable code.
- Sequence order and decisions require evidence. AI results remain proposals.
- Stable outputs; managed overwrite only; bounded archive decoding.

## Review Focus

- Hidden/deleted ancestors must exclude their children from semantic output (Task 1/2).
- Cross-area edges and same-name nodes must not disappear or merge (Task 2/3).
- Broken or invented sequence ordering and unproven decisions must not become facts (Task 2/4).
- Existing outputs, symlink paths and user-created files must survive failed exports (Task 3/5).
- AI results citing nonexistent, hidden or unsubmitted source content must be rejected (Task 4).

## Files and interfaces

`src/model.ts`: runtime schemas and types for source/model/evidence.
`src/importer.ts`: `readJam(path): Promise<ImportedBoard>`; `normalizeNodes(nodes, file, assets): SourceDocument`.
`src/analyze.ts`: `analyze(source, mapping?): Model` and `applyMapping(model, mapping, origin): Model`.
`src/validate.ts`: `validateModel(input): Model`, including relational/evidence checks.
`src/render.ts`: `renderFiles(model): Map<string,string>`.
`src/output.ts`: `writeOutput(dir, model, assetBytes, overwrite): Promise<void>` and safe asset loading.
`src/enrich.ts`: `enrich(model, options, transport?): Promise<Model>`; only this module performs external requests.
`src/cli.ts`: inspect, convert, render, enrich commands with JSON summaries and stderr errors.
`test/*.test.ts`, `test/fixtures.ts`: small synthetic source/archives and boundary tests.
`examples/`: non-customer fixtures and a mapping example.

### Task 1: Read and normalize JAM files

- [x] Write importer tests for invalid archive, size limits, native text/connector/image preservation and hidden ancestors. Example assertion:

```ts
assert.equal(source.nodes.find((n) => n.id === '1:3')?.visible, false);
```

- [x] Run `pnpm test`; expect failed assertions against the importer's initial empty result.
- [x] Implement bounded ZIP inspection and parser adapter. Reject path traversal and malformed chunks before decoding. Normalize parent/section/image refs without discarding source text.
- [x] Run `pnpm test` and `pnpm typecheck`; expect success.
- [x] Inspect both private JAM files locally, record node counts and actual connector/text shapes; do not commit source files.
- [x] Commit importer and source schemas.

### Task 2: Build semantic model and mappings

- [x] Write tests for cross-area relations, native arrow direction, unclassified notes, explicit requirement/decision sections and mapping-provided numbered sequences.

```ts
assert.equal(analyze(source).sequences.length, 0); // unnumbered connector is not a timeline
```

- [x] Run tests; expect missing semantic results.
- [x] Implement section/view grouping, conservative classification, source-derived IDs and explicit mapping schema. Validate sources and references. Mapping supports area assignments plus sourced systems, relations, sequences, requirements, workshop notes and decisions.
- [x] Test duplicate step order, absent evidence, hidden sources and fake quotes; each must reject.
- [x] Run suite/typecheck and commit.

### Task 3: Export documents safely

- [x] Write tests asserting four export types, preserved external nodes, escaped labels, evidence links, draft ADR status and no sequence output without evidence.

```ts
assert.match(files.get('requirements.md')!, /Quellen/);
```

- [x] Add filesystem tests: reject existing directory by default; overwrite only managed files; reject symlinks; do not delete unrelated files.
- [x] Implement Markdown/Mermaid renderers, source catalogue, coverage report, manifest-based output writer and asset copying.
- [x] Parse every sample Mermaid result using Mermaid under jsdom; run suite/typecheck and commit.

### Task 4: Optional AI enrichment

- [x] Write transport-boundary tests with realistic Responses JSON for successful proposals, refusal/incomplete/error responses, nonexistent references, invented quotes and unsupported provider/model configuration.

```ts
await assert.rejects(
  () => enrich(model, { provider: 'openai', model: '', apiKey: '' }),
  /model|Modell/,
);
```

- [x] Implement OpenAI Responses HTTP adapter using explicit model, API key and selected source IDs/images. No model or key implies no call. Use structured output, `store:false`, timeout and bounded request/response sizes.
- [x] Validate all returned data, mark it as AI proposals, and retain original source model. Selection is exact; unsubmitted references reject. Enriched model can be re-rendered offline.
- [x] Run mocked-network suite/typecheck. Do not send customer files during development. Commit.

### Task 5: CLI, examples and real-file verification

- [x] Write child-process tests for inspect, convert, render, enrich dry-run, invalid arguments and overwrite refusal.

```ts
assert.equal(run(['convert', fixture, '--out', existing]).status, 1);
```

- [x] Implement CLI, bundled schemas/help, README and synthetic demonstration including every supported output category.
- [x] Run all tests and build; convert both user-provided archives locally and record coverage and source checksum preservation.
- [x] Validate every generated Mermaid file, visually inspect representative flow/sequence renders, and check package executable installation.
- [x] Commit. Obtain final independent review while completing the integration report. Fix important findings with regression tests and rerun checks.
