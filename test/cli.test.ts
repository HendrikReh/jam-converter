import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { jamBytes, simpleNodes } from './fixtures.ts';
const run = (args: string[], preload?: string) =>
  spawnSync(
    process.execPath,
    [...(preload ? ['--import', preload] : []), resolve('src/cli.ts'), ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, OPENAI_API_KEY: preload ? 'test-key' : '' },
    },
  );
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
test('CLI rejects predictable output failures before calling the paid API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jam-preflight-'));
  try {
    const jam = join(dir, 'demo.jam');
    await writeFile(jam, jamBytes(simpleNodes()));
    const out = join(dir, 'output');
    assert.equal(run(['convert', jam, '--out', out]).status, 0);
    const mock = join(dir, 'mock.mjs');
    await writeFile(
      mock,
      `globalThis.fetch = async () => {
      process.stdout.write('NETWORK_CALLED');
      return new Response(JSON.stringify({status:'completed', output:[{type:'message',
        content:[{type:'output_text', text:'{}'}]}]}));
    };`,
    );
    const unowned = join(dir, 'unowned');
    await mkdir(unowned);
    const args = ['enrich', join(out, 'model.json'), '--model', 'test-model'];
    const existing = run([...args, '--out', out], mock);
    assert.equal(existing.status, 1);
    assert.match(existing.stderr, /already exists/i);
    assert.doesNotMatch(existing.stdout, /NETWORK_CALLED/);
    const invalidManifest = run([...args, '--out', unowned, '--overwrite'], mock);
    assert.equal(invalidManifest.status, 1);
    assert.match(invalidManifest.stderr, /manifest/i);
    assert.doesNotMatch(invalidManifest.stdout, /NETWORK_CALLED/);
    await writeFile(join(out, 'requirements.md'), 'local edit');
    const modified = run([...args, '--out', out, '--overwrite'], mock);
    assert.equal(modified.status, 1);
    assert.match(modified.stderr, /modified/i);
    assert.doesNotMatch(modified.stdout, /NETWORK_CALLED/);
    const valid = run([...args, '--out', join(dir, 'enriched')], mock);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /NETWORK_CALLED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
