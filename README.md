# JAM Converter

Convert local FigJam files into editable architecture documentation:

- Mermaid flowcharts grouped by board area, preserving native connections and arrow directions.
- Mermaid sequence diagrams for explicitly numbered messages in a sequence or interaction section.
- Markdown for requirements, workshop notes and tables.
- Draft Architecture Decision Records (ADRs) for explicitly documented decisions and rationale.
- Optional AI analysis of selected text and diagram images through OpenAI.

Every derived record includes source references. Ambiguous content remains visible in the review report. Source text such as “ignore all instructions” is treated as document content.

## Getting started

Requires Node.js **24 or newer** and pnpm. No Figma account is required.

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
node dist/cli.js convert "/path/board.jam" --out output/board
```

For development without a build: `pnpm start convert "/path/board.jam" --out output/board`.
The package executable is named `jam-convert`; it can be invoked directly after installing the package locally. The project is marked `private` to prevent accidental package publication.

A synthetic example demonstrates all four output types without customer data:

```sh
node dist/cli.js render examples/demo.model.json --out output/demo
```

## Commands

| Command                                                          | Purpose                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `inspect board.jam`                                              | JSON inventory of element types, sections and image IDs           |
| `inspect board.jam --sources`                                    | Also include original text and native node IDs                    |
| `convert board.jam --out output/board`                           | Convert entirely locally                                          |
| `convert board.jam --mapping mapping.json --out output/board`    | Apply local mappings and additions                                |
| `render output/board/model.json --out output/reviewed`           | Export a saved model again without AI                             |
| `render model.json --mapping mapping.json --out output/reviewed` | Correct and export a model locally                                |
| `enrich model.json --model MODEL --dry-run`                      | Review the planned data transfer without making a network request |

`--out` always specifies a **directory**. This also applies to `enrich`: the model and image files stay together so they can be rendered offline later. Commands return JSON summaries on stdout; errors go to stderr with exit code 1. Successful commands use exit code 0.

Existing output directories are rejected by default. `--overwrite` updates only unchanged converter files recorded in a manifest. Your own files are preserved; the export stops if converter files have been edited manually or filenames conflict. To make changes, edit the model or a mapping file and render into a new directory.

## Output

```text
README.md               Overview with Mermaid diagrams
model.json              Editable domain model, including sources
sources.json            Normalized native board elements
sources.md              Source catalog with original text and images
requirements.md         Classified requirements
workshop-results.md     Notes and native tables grouped by board area
review.md               Unresolved relations, image analysis and other review items
diagrams/*.mmd          Flowcharts grouped by area/view
sequences/*.mmd         Numbered interactions supported by evidence
adrs/*.md               Draft ADRs
assets/*                Embedded images
.jam-converter.json     Manifest for controlled overwrites
```

The Markdown files can be read in any text editor. A reader with Mermaid support renders the diagrams directly. Keep `model.json`, `sources.json` and `assets/` together; a relocated model needs its associated image files at the same relative paths.

## What local conversion recognizes

FigJam sometimes stores sticky notes, shapes and connector labels in nested text overrides. The importer reads this text and the row/column order of native tables. Hidden and deleted elements remain documented in the source catalog but do not appear as active domain content.

Sections form the initial domain areas. Headings containing IST (current state), SOLL/Ziel/Target (target state) or Transition determine the view. A shared name alone is not enough to merge two boxes. Connections across areas also show their external endpoints.

Connected boxes with short text are initially imported as **diagram elements**. This does not establish that every box represents a software system. Long text, questions and unclassified notes remain workshop content.

Requirements are recognized through explicit requirements sections or prefixes such as `Requirement:`. ADRs need a clear decision marker, for example:

```text
Context: An identity provider is available.
Decision: Use OpenID Connect.
Rationale: The existing provider supports OIDC.
Consequences: The webshop needs an OIDC client.
Status: Agreed during the workshop.
```

Missing information is labeled “nicht dokumentiert” (“not documented”). Every generated ADR remains an **“Entwurf zur Prüfung” (“draft for review”)**, even if the source records an approval status. Generated prose currently uses German.

Sequences require a section such as `Sequence Login` or `Interaction Order` and clearly numbered, directed connectors (`1. Login`, `2. Token`). Spatial layout alone does not establish chronological order. Missing or duplicate numbers and ambiguous directions do not produce an invented sequence.

## Local mappings

[`examples/mapping.json`](examples/mapping.json) demonstrates a reworded requirement supported by source evidence. An existing ID replaces that record; a new ID adds a record. Categories omitted from the mapping remain unchanged.

A mapping can contain these arrays:

- `areas`: new or renamed areas with `id`, `title` and `view`.
- `assignments`: `{ "sourceId": "1:2", "areaId": "area-1:1" }` assigns content derived from this source to an area.
- `excludeIds`: domain content IDs to remove from the output. Relations referencing them must also be updated.
- `systems`, `relations`, `sequences`, `requirements`, `workshop`, `decisions`: additions or replacements supported by evidence.

Text evidence consists of `sourceId`, a verbatim `quote` and `region: null`. For image evidence, `sourceId` is the image ID (`image:…`) and `region` describes the visible area. Quotes must occur in the original source. References and sequence numbers are validated. For native text, numbering must start at an original source line boundary; shortening a quote must not create an apparent order. Numbers cited from images remain interpretations requiring visual review. Types and field definitions are in [`src/model.ts`](src/model.ts); [`examples/demo.model.json`](examples/demo.model.json) contains complete records.

## Optional AI analysis

The first supported provider is **OpenAI Responses**. Choose a model available in your API project that supports Structured Outputs and, for image analysis, image understanding. No model is selected by default.

```sh
export OPENAI_API_KEY="your-api-key"
export JAM_CONVERTER_MODEL="your-model"

# Review the selection: visible text, no images, no data transfer
node dist/cli.js enrich output/board/model.json --dry-run

# Send only the specified text source
node dist/cli.js enrich output/board/model.json \
  --source "1:2" --out output/enriched

# Send only one selected image
node dist/cli.js enrich output/board/model.json \
  --no-text --image "image:IMAGE_HASH_FROM_INSPECT" --out output/vision
```

`--source` and `--image` can be repeated. Without `--source`, all visible native text is selected; images are included only through `--image`. `--no-text` disables text selection. An existing API key does not activate AI: `convert` and `render` remain offline.

Existing output directories without `--overwrite`, invalid manifests and manually modified outputs are rejected before the API request. The export checks them again before writing.

Calling `enrich` without `--dry-run` sends the selected data to the OpenAI API and may incur API costs. The request uses `store: false`. This is not a guarantee covering all data retention policies for the API account.

AI output consists of proposed additions with source evidence. The converter validates the schema, references and text quotes; this does not replace domain review of the claims or visual checks of arrow directions. AI proposals cannot delete or overwrite native content. They are labeled as AI proposals, including in standalone Mermaid files, and can be revised locally afterwards. Relations may reference only existing systems included in the request or newly proposed systems.

Each request is limited to 12 images, 160,000 characters of source text and a 24 MiB request body. If a limit is exceeded, reduce the selection; content is not silently truncated. Missing configuration, HTTP errors, refusals and incomplete responses produce an error instead of an apparent success.

## Limitations

- JAM is a proprietary format. Version 106 has been tested with the two supplied files; future exports may require adjustments.
- Local conversion does not reconstruct diagrams embedded as images. It preserves the images and flags them for visual review or AI analysis.
- Colors alone are not interpreted as domain status. Confirmed meanings can be added explicitly as status fields in the model.
- Native Figma components, widgets and complex vector graphics are not fully rendered. Available text is preserved; unsupported types are listed in the review report.
- Comments and version history are not part of local JAM copies.
- Limits: 64 MiB input file, 256 MiB unpacked data and 100,000 native nodes. These defaults are intended for local project boards.

## Development and verification

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
node scripts/validate-mermaid.ts output
```

Tests cover native tables/connectors, hidden content, source evidence, mappings, chronology, ADRs, Mermaid syntax, file protection and CLI behavior. AI tests replace only the HTTP transport; no customer data is transmitted for testing.

Local customer examples and generated documents are stored in the ignored `output/` directory and are not committed to the repository. The local verification report is `output/verification.md`.

Technical references: [Figma file format](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files), [openfig-core](https://github.com/OpenFig-org/openfig-core), [Mermaid](https://mermaid.js.org/intro/syntax-reference.html), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision).
