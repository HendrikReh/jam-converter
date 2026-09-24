import test from 'node:test';
import assert from 'node:assert/strict';
import { enrich, prepareEnrichment } from '../src/enrich.ts';
import { analyze } from '../src/analyze.ts';
import { normalizeNodes } from '../src/importer.ts';
import { simpleNodes, file } from './fixtures.ts';
const model = () => analyze(normalizeNodes(simpleNodes(), file, []));
const options = {
  provider: 'openai',
  model: 'test-model',
  apiKey: 'test-key',
  sourceIds: ['1:2'],
  imageIds: [],
  assets: new Map(),
};
const requirement = (sourceId = '1:2', quote = 'Shop') => ({
  id: 'ai-req',
  areaId: 'area-1:1',
  text: 'Shop',
  status: null,
  owner: null,
  priority: null,
  evidence: [{ sourceId, quote, region: null }],
});
const reply = (patch: unknown) =>
  new Response(
    JSON.stringify({
      id: 'resp_test',
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(patch) }] },
      ],
    }),
  );
test('enrichment sends selected sources only and marks valid returned records as AI proposals', async () => {
  let request: any;
  const result = await enrich(model(), options, async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    request = JSON.parse(init.body);
    return reply({ requirements: [requirement()] });
  });
  assert.equal(result.requirements[0].origin, 'ai');
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, 'json_schema');
  assert.match(JSON.stringify(request.input), /Shop/);
  assert.doesNotMatch(JSON.stringify(request.input), /ERP/);
  assert.equal(result.source.file.sha256, 'a'.repeat(64));
});
test('unsubmitted references and invented text quotes are rejected', async () => {
  await assert.rejects(
    () =>
      enrich(model(), options, async () => reply({ requirements: [requirement('1:3', 'ERP')] })),
    /selected|submitted|ausgewählt/i,
  );
  await assert.rejects(
    () =>
      enrich(model(), options, async () =>
        reply({ requirements: [requirement('1:2', 'invented')] }),
      ),
    /quote|Zitat/i,
  );
});
test('missing configuration, refusal, incomplete and HTTP failure never return a false success', async () => {
  let called = false;
  const network = async () => {
    called = true;
    return reply({});
  };
  await assert.rejects(() => enrich(model(), { ...options, model: '' }, network), /model|Modell/i);
  assert.equal(called, false);
  await assert.rejects(
    () => enrich(model(), { ...options, apiKey: '' }, network),
    /key|Schlüssel/i,
  );
  await assert.rejects(
    () => enrich(model(), options, async () => new Response('{}', { status: 429 })),
    /429/,
  );
  await assert.rejects(
    () =>
      enrich(
        model(),
        options,
        async () => new Response(JSON.stringify({ status: 'incomplete', output: [] })),
      ),
    /incomplete/i,
  );
  await assert.rejects(
    () =>
      enrich(
        model(),
        options,
        async () =>
          new Response(
            JSON.stringify({
              status: 'completed',
              output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
            }),
          ),
      ),
    /refus/i,
  );
});
test('dry-run builds a request without credentials and rejects hidden selections', async () => {
  const p = await prepareEnrichment(model(), { ...options, apiKey: '' });
  assert.equal(p.sourceIds.length, 1);
  const m = model();
  m.source.nodes.find((n) => n.id === '1:3').visible = false;
  await assert.rejects(
    () => prepareEnrichment(m, { ...options, sourceIds: ['1:3'] }),
    /hidden|sichtbar/i,
  );
});
