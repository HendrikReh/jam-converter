import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { normalizeNodes, readJam } from '../src/importer.ts';
import { file, rawNode, guid, jamBytes, simpleNodes } from './fixtures.ts';

test('keeps nested FigJam text and actual connector endpoints', () => {
  const s = normalizeNodes(simpleNodes(), file, []);
  assert.equal(s.nodes.find((n) => n.id === '1:2').text, 'Shop');
  assert.deepEqual(s.nodes.find((n) => n.id === '1:4').connector, {
    startId: '1:2',
    endId: '1:3',
    startArrow: false,
    endArrow: true,
  });
  assert.deepEqual(s.nodes.find((n) => n.id === '1:3').sectionPath, ['1:1']);
});
test('hidden and removed ancestors suppress descendants', () => {
  const s = normalizeNodes(
    [
      rawNode(1, 'SECTION', 'hidden', 0, { visible: false }),
      rawNode(2, 'TEXT', 'secret', 1),
      rawNode(3, 'SECTION', 'deleted', 0, { phase: 'REMOVED' }),
      rawNode(4, 'TEXT', 'old', 3),
    ],
    file,
    [],
  );
  assert.equal(s.nodes.find((n) => n.id === '1:2').visible, false);
  assert.equal(s.nodes.find((n) => n.id === '1:4').visible, false);
});
test('preserves table row and column order from native IDs', () => {
  const t = rawNode(5, 'TABLE', 'Matrix', 0, {
    tableRowPositions: {
      entries: [
        { id: guid(11), position: 'b' },
        { id: guid(10), position: 'a' },
      ],
    },
    tableColumnPositions: { entries: [{ id: guid(20), position: 'a' }] },
    nodeGenerationData: {
      overrides: [
        { guidPath: { guids: [guid(0), guid(11), guid(20)] }, textData: { characters: 'Value' } },
        { guidPath: { guids: [guid(0), guid(10), guid(20)] }, textData: { characters: 'Heading' } },
      ],
    },
  });
  assert.deepEqual(normalizeNodes([t], file, []).nodes[0].table, [['Heading'], ['Value']]);
});
test('archive reader handles actual encoded JAM and rejects malformed/oversized archives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jam-import-'));
  try {
    const path = join(dir, 'demo.jam');
    await writeFile(path, jamBytes(simpleNodes()));
    const result = await readJam(path);
    assert.equal(result.source.nodes.length, 5);
    assert.equal(result.source.file.formatVersion, 106);
    await assert.rejects(() => readJam(path, { maxBytes: 8 }), /limit|groß|size/i);
    await writeFile(path, zipSync({ 'canvas.fig': new Uint8Array([1, 2]) }));
    await assert.rejects(() => readJam(path), /canvas|header|Format|trunc/i);
    await writeFile(path, zipSync({ '../evil': strToU8('no'), 'canvas.fig': new Uint8Array([1]) }));
    await assert.rejects(() => readJam(path), /path|Pfad/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
