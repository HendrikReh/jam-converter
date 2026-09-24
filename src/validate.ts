import { ModelSchema, contentKeys } from './model.ts';
import type { Model, Evidence, SourceDocument } from './model.ts';
const compact = (s: string) => s.replace(/\s+/g, ' ').trim();
export function validateEvidence(evidence: Evidence[], source: SourceDocument): void {
  for (const e of evidence) {
    const node = source.nodes.find((n) => n.id === e.sourceId);
    const asset = source.assets.find((a) => a.id === e.sourceId);
    if (node) {
      if (!node.visible) throw new Error(`Source hidden / nicht sichtbar: ${e.sourceId}`);
      if (
        !e.quote?.trim() ||
        ![node.text, node.name].some((s) => compact(s).includes(compact(e.quote!)))
      )
        throw new Error(`Invalid source quote / Zitat: ${e.sourceId}`);
    } else if (asset) {
      if (!e.region?.trim()) throw new Error(`Image reference needs region: ${e.sourceId}`);
      if (!asset.nodeIds.some((k) => source.nodes.some((n) => n.id === k && n.visible)))
        throw new Error(`Image source hidden or unreferenced: ${e.sourceId}`);
    } else throw new Error(`Unknown source reference: ${e.sourceId}`);
  }
}
export function validateModel(input: unknown): Model {
  const m = ModelSchema.parse(input);
  const areas = new Set<string>(),
    systems = new Set<string>();
  for (const a of m.areas) {
    if (areas.has(a.id)) throw new Error(`Duplicate area ID: ${a.id}`);
    areas.add(a.id);
  }
  const ids = new Set<string>();
  for (const key of contentKeys)
    for (const entry of m[key]) {
      if (ids.has(entry.id)) throw new Error(`Duplicate content ID: ${entry.id}`);
      ids.add(entry.id);
      if (!areas.has(entry.areaId)) throw new Error(`Unknown area reference: ${entry.areaId}`);
      validateEvidence(entry.evidence, m.source);
    }
  for (const s of m.systems) systems.add(s.id);
  for (const r of m.relations)
    if (!systems.has(r.from) || !systems.has(r.to))
      throw new Error(`Unknown System target reference: ${r.id}`);
  for (const seq of m.sequences) {
    const sorted = [...seq.steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i]!;
      if (s.order !== i + 1)
        throw new Error(`Sequence order must be consecutive and unique: ${seq.id}`);
      if (!systems.has(s.from) || !systems.has(s.to))
        throw new Error(`Unknown sequence System reference: ${seq.id}`);
      validateEvidence(s.evidence, m.source);
      const numbered = new RegExp(`(?:^|\\n)\\s*(?:(?:Schritt|Step)\\s+)?${s.order}[.):]\\s+`, 'i');
      if (
        !s.evidence.some((e) => {
          if (!e.quote || !numbered.test(e.quote)) return false;
          const node = m.source.nodes.find((n) => n.id === e.sourceId);
          // Image numbering remains an interpretation requiring visual review.
          if (!node) return true;
          return [node.text, node.name].some((text) =>
            [...text.matchAll(new RegExp(numbered.source, 'gi'))].some((match) =>
              compact(text.slice(match.index)).startsWith(compact(e.quote!)),
            ),
          );
        })
      )
        throw new Error(`Missing explicit order evidence / Reihenfolge: ${seq.id} step ${s.order}`);
    }
    seq.steps = sorted;
  }
  return m;
}
