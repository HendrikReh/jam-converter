import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeNodes } from '../src/importer.ts';
import { analyze } from '../src/analyze.ts';
import { renderFiles } from '../src/render.ts';
import { writeOutput } from '../src/output.ts';
import { rawNode, guid, file, simpleNodes } from './fixtures.ts';
export function demoModel() {
  const ns = simpleNodes();
  ns[1] = rawNode(1, 'SECTION', 'Sequenz Login');
  ns[2].nodeGenerationData.overrides[0].textData.characters =
    'Shop "EU" | <script>alert(1)</script>';
  ns[4].nodeGenerationData.overrides[0].textData.characters = '1. Login: "SSO"; end';
  ns.push(
    rawNode(5, 'SECTION', 'Anforderungen'),
    rawNode(6, 'STICKY', '', 5, { textData: { characters: 'SSO muss verfügbar sein.' } }),
    rawNode(7, 'STICKY', '', 5, {
      textData: { characters: 'Entscheidung: OIDC verwenden.\nBegründung: kompatibel.' },
    }),
  );
  return analyze(normalizeNodes(ns, file, []));
}
test('renders four artifact types with sources and draft ADR status', () => {
  const files = renderFiles(demoModel());
  assert.match(files.get('requirements.md') ?? '', /SSO muss/);
  assert.match(files.get('requirements.md') ?? '', /Quellen/);
  assert.equal([...files.keys()].filter((k) => k.startsWith('diagrams/')).length, 1);
  assert.equal([...files.keys()].filter((k) => k.startsWith('sequences/')).length, 1);
  const adr = [...files.entries()].find(([k]) => k.startsWith('adrs/'))?.[1] ?? '';
  assert.match(adr, /Entwurf/);
  assert.match(adr, /kompatibel/);
  assert.match(files.get('README.md') ?? '', /```mermaid/);
});
test('generated Mermaid parses even with quotes, delimiters and HTML-like labels', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<body></body>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const files = renderFiles(demoModel());
  assert.ok([...files.keys()].some((k) => k.endsWith('.mmd')));
  for (const [path, content] of files)
    if (path.endsWith('.mmd')) {
      assert.ok(await mermaid.parse(content), path);
      assert.doesNotMatch(content, /<script>/);
    }
});
test('output preserves unrelated files and rejects overwrite and symlink hazards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jam-output-'));
  const out = join(root, 'docs');
  try {
    await writeOutput(out, demoModel(), new Map(), false);
    assert.match(await readFile(join(out, 'README.md'), 'utf8'), /Login/);
    await assert.rejects(() => writeOutput(out, demoModel(), new Map(), false), /exist|besteht/i);
    await writeFile(join(out, 'personal.txt'), 'keep');
    await writeOutput(out, demoModel(), new Map(), true);
    assert.equal(await readFile(join(out, 'personal.txt'), 'utf8'), 'keep');
    await writeFile(join(out, 'requirements.md'), 'my edit');
    await assert.rejects(
      () => writeOutput(out, demoModel(), new Map(), true),
      /modified|geändert/i,
    );
    assert.equal(await readFile(join(out, 'requirements.md'), 'utf8'), 'my edit');
    const link = join(root, 'link');
    await symlink(out, link);
    await assert.rejects(() => writeOutput(link, demoModel(), new Map(), true), /symlink/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('flowchart retains external endpoints across areas', () => {
  const ns = simpleNodes();
  ns.push(rawNode(5, 'SECTION', 'Andere Domäne'));
  ns[3].parentIndex.guid = guid(5);
  const files = renderFiles(analyze(normalizeNodes(ns, file, [])));
  const diagrams = [...files].filter(([p]) => p.startsWith('diagrams/'));
  assert.equal(diagrams.length, 2);
  for (const [, text] of diagrams) {
    assert.match(text, /Shop/);
    assert.match(text, /ERP/);
  }
});
test('standalone Mermaid visibly labels AI relations and sequences as proposals', async () => {
  const m = demoModel();
  m.relations[0].origin = 'ai';
  m.sequences[0].origin = 'ai';
  for (const label of ['Login', '']) {
    m.relations[0].label = label;
    const files = renderFiles(m);
    const diagram = [...files].find(([p]) => p.startsWith('diagrams/'))[1];
    const sequence = [...files].find(([p]) => p.startsWith('sequences/'))[1];
    assert.match(diagram, /-->\|"[^\n]*KI-Vorschlag/);
    assert.match(sequence, /Note over .*KI-Vorschlag/);
    const mermaid = (await import('mermaid')).default;
    assert.ok(await mermaid.parse(diagram));
    assert.ok(await mermaid.parse(sequence));
  }
});
test('edited asset paths cannot replace generated documents or their manifest', () => {
  for (const path of ['README.md', '.jam-converter.json', 'assets/../README.md']) {
    const m = demoModel();
    m.source.assets.push({
      id: 'image:' + 'a'.repeat(40),
      hash: 'a'.repeat(40),
      sha256: 'b'.repeat(64),
      mimeType: 'image/png',
      path,
      nodeIds: ['1:2'],
    });
    assert.throws(() => renderFiles(m), /asset|path/i);
  }
});
