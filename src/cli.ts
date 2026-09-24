#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readJam } from './importer.ts';
import { analyze, applyMapping } from './analyze.ts';
import { validateModel } from './validate.ts';
import { loadAssets, writeOutput, checkOutputTarget } from './output.ts';
import { enrich, prepareEnrichment } from './enrich.ts';
import type { Model } from './model.ts';
const help = `jam-convert — lokale FigJam-Konvertierung

  inspect <datei.jam> [--sources]
  convert <datei.jam> --out <ordner> [--mapping <datei.json>] [--overwrite]
  render <model.json> --out <ordner> [--mapping <datei.json>] [--overwrite]
  enrich <model.json> --provider openai --model <modell> [--out <ordner>]
         [--source <node-id>]... [--image <image:hash>]... [--no-text]
         [--dry-run] [--overwrite]

inspect gibt ein JSON-Inventar aus; --sources ergänzt die nativen Texte.
convert und render arbeiten ausschließlich lokal.
enrich sendet nur beim Aufruf ohne --dry-run Daten an OpenAI.
Standardauswahl: alle sichtbaren nativen Texte, keine Bilder.
--source beschränkt die Textauswahl; --no-text wählt nur Bilder.
OPENAI_API_KEY ist nur für enrich nötig. JAM_CONVERTER_MODEL kann --model ersetzen.
--out ist stets ein Ausgabeordner; model.json und Bilddateien bleiben zusammen.
Bestehende Ausgabeordner werden nur mit --overwrite überschrieben.
Manuell geänderte oder fremde Dateien werden nicht überschrieben.
`;
async function readJson(path: string): Promise<unknown> {
  if ((await stat(path)).size > 64 * 1024 * 1024) throw new Error('JSON file size limit exceeded');
  return JSON.parse(await readFile(path, 'utf8'));
}
const summary = (m: Model, out: string) => ({
  out: resolve(out),
  nodes: m.source.nodes.length,
  systems: m.systems.length,
  relations: m.relations.length,
  sequences: m.sequences.length,
  requirements: m.requirements.length,
  workshop: m.workshop.length,
  decisions: m.decisions.length,
  reviewItems: m.issues.length,
});
async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      out: { type: 'string' },
      mapping: { type: 'string' },
      overwrite: { type: 'boolean' },
      provider: { type: 'string' },
      model: { type: 'string' },
      source: { type: 'string', multiple: true },
      image: { type: 'string', multiple: true },
      'no-text': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      sources: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
  });
  if (values.help || (!positionals.length && !Object.keys(values).length)) {
    console.log(help);
    return;
  }
  if (values.version) {
    console.log('0.1.0');
    return;
  }
  const [command, input] = positionals;
  if (!command || !['inspect', 'convert', 'render', 'enrich'].includes(command))
    throw new Error('Unknown command; use --help');
  if (!input || positionals.length !== 2) throw new Error('Exactly one input file is required');
  const allowed: Record<string, string[]> = {
    inspect: ['sources'],
    convert: ['out', 'mapping', 'overwrite'],
    render: ['out', 'mapping', 'overwrite'],
    enrich: ['out', 'overwrite', 'provider', 'model', 'source', 'image', 'no-text', 'dry-run'],
  };
  for (const key of Object.keys(values))
    if (!allowed[command]!.includes(key))
      throw new Error(`Option --${key} is not valid for ${command}`);
  if (command !== 'inspect' && !(command === 'enrich' && values['dry-run']) && !values.out)
    throw new Error('--out <directory> required');
  if (command === 'inspect' || command === 'convert') {
    const imported = await readJam(input);
    if (command === 'inspect') {
      console.log(
        JSON.stringify(
          {
            file: imported.source.file,
            nodes: imported.source.nodes.length,
            visible: imported.source.nodes.filter((n) => n.visible).length,
            types: imported.source.nodes.reduce<Record<string, number>>(
              (r, n) => ((r[n.type] = (r[n.type] ?? 0) + 1), r),
              {},
            ),
            sections: imported.source.nodes
              .filter((n) => n.type === 'SECTION')
              .map((n) => ({ id: n.id, name: n.name, visible: n.visible })),
            assets: imported.source.assets,
            diagnostics: imported.source.diagnostics,
            ...(values.sources ? { sources: imported.source.nodes } : {}),
          },
          null,
          2,
        ),
      );
      return;
    }
    const m = analyze(imported.source, values.mapping ? await readJson(values.mapping) : undefined);
    await writeOutput(values.out!, m, imported.assets, values.overwrite);
    console.log(JSON.stringify(summary(m, values.out!), null, 2));
    return;
  }
  let model = validateModel(await readJson(input));
  const assets = await loadAssets(model, dirname(resolve(input)));
  if (command === 'render') {
    if (values.mapping) model = applyMapping(model, await readJson(values.mapping), 'manual');
  } else {
    if (values['no-text'] && values.source?.length)
      throw new Error('--no-text and --source cannot be combined');
    const options = {
      provider: values.provider ?? 'openai',
      model: values.model ?? process.env.JAM_CONVERTER_MODEL ?? '',
      apiKey: process.env.OPENAI_API_KEY,
      sourceIds: values['no-text'] ? [] : values.source,
      imageIds: values.image,
      assets,
    };
    if (values['dry-run']) {
      const preview = await prepareEnrichment(model, options);
      console.log(
        JSON.stringify(
          {
            networkRequest: false,
            provider: options.provider,
            model: options.model,
            sourceIds: preview.sourceIds,
            imageIds: preview.imageIds,
            requestBytes: preview.bytes,
          },
          null,
          2,
        ),
      );
      return;
    }
    await checkOutputTarget(values.out!, values.overwrite);
    model = await enrich(model, options);
  }
  await writeOutput(values.out!, model, assets, values.overwrite);
  console.log(JSON.stringify(summary(model, values.out!), null, 2));
}
main().catch((error: unknown) => {
  console.error(`jam-convert: ${error instanceof Error ? error.message : 'Conversion failed'}`);
  process.exitCode = 1;
});
