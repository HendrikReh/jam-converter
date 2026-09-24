import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { jamBytes, simpleNodes } from './fixtures.ts';
const run = (args: string[]) =>
  spawnSync(process.execPath, [resolve('src/cli.ts'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: '' },
  });
test('CLI inspect, convert, offline render, dry-run and safe failure work end-to-end', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jam-cli-'));
  try {
    const jam = join(dir, 'demo.jam');
    await writeFile(jam, jamBytes(simpleNodes()));
    const inspected = run(['inspect', jam]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).nodes, 5);
    const out = join(dir, 'output');
    const converted = run(['convert', jam, '--out', out]);
    assert.equal(converted.status, 0, converted.stderr);
    assert.equal(JSON.parse(converted.stdout).relations, 1);
    assert.match(await readFile(join(out, 'README.md'), 'utf8'), /Shop/);
    const duplicate = run(['convert', jam, '--out', out]);
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /exist/i);
    const rendered = run(['render', join(out, 'model.json'), '--out', join(dir, 'rendered')]);
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.equal(
      await readFile(join(out, 'README.md'), 'utf8'),
      await readFile(join(dir, 'rendered', 'README.md'), 'utf8'),
    );
    const dry = run([
      'enrich',
      join(out, 'model.json'),
      '--provider',
      'openai',
      '--model',
      'test-model',
      '--source',
      '1:2',
      '--dry-run',
    ]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).networkRequest, false);
    assert.deepEqual(JSON.parse(dry.stdout).sourceIds, ['1:2']);
    assert.equal(run(['unknown', jam]).status, 1);
    assert.equal(run(['convert', jam, '--unknown']).status, 1);
    assert.equal(run(['convert', jam]).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
