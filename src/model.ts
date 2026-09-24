import { z } from 'zod';
export const FileSchema = z.object({
  name: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  formatVersion: z.number().int(),
  title: z.string().optional(),
  exportedAt: z.string().optional(),
});
export const AssetSchema = z.object({
  id: z.string(),
  hash: z.string(),
  sha256: z.string(),
  mimeType: z.string(),
  path: z.string().regex(/^assets\/[a-f0-9]{40}\.(?:png|jpg|gif|webp|bin)$/, 'Invalid asset path'),
  nodeIds: z.array(z.string()),
});
export const SourceNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  text: z.string(),
  parentId: z.string().optional(),
  sectionPath: z.array(z.string()),
  visible: z.boolean(),
  position: z.object({ x: z.number(), y: z.number() }),
  imageHashes: z.array(z.string()),
  table: z.array(z.array(z.string())).optional(),
  connector: z
    .object({
      startId: z.string().optional(),
      endId: z.string().optional(),
      startArrow: z.boolean(),
      endArrow: z.boolean(),
    })
    .optional(),
});
export const SourceSchema = z.object({
  schemaVersion: z.literal(1),
  file: FileSchema,
  nodes: z.array(SourceNodeSchema),
  assets: z.array(AssetSchema),
  diagnostics: z.array(z.string()),
});
export type SourceNode = z.infer<typeof SourceNodeSchema>;
export type SourceDocument = z.infer<typeof SourceSchema>;
export type SourceFile = z.infer<typeof FileSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type ImportedBoard = { source: SourceDocument; assets: Map<string, Uint8Array> };

export const EvidenceSchema = z
  .object({
    sourceId: z.string().min(1),
    quote: z.string().nullable(),
    region: z.string().nullable(),
  })
  .strict();
const OriginSchema = z.enum(['native', 'rule', 'manual', 'ai']);
const common = {
  id: z.string().min(1),
  areaId: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
  origin: OriginSchema.default('manual'),
};
export const AreaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    view: z.enum(['ist', 'soll', 'transition', 'unspecified']),
  })
  .strict();
export const SystemSchema = z
  .object({
    ...common,
    name: z.string().min(1),
    kind: z.enum(['system', 'element']).default('element'),
    status: z.string().nullable().default(null),
  })
  .strict();
export const RelationSchema = z
  .object({
    ...common,
    from: z.string(),
    to: z.string(),
    label: z.string(),
    direction: z.enum(['forward', 'both', 'none']),
  })
  .strict();
export const StepSchema = z
  .object({
    order: z.number().int().positive(),
    from: z.string(),
    to: z.string(),
    message: z.string().min(1),
    evidence: z.array(EvidenceSchema).min(1),
  })
  .strict();
export const SequenceSchema = z
  .object({ ...common, title: z.string().min(1), steps: z.array(StepSchema).min(1) })
  .strict();
export const NoteSchema = z
  .object({
    ...common,
    text: z.string().min(1),
    status: z.string().nullable().default(null),
    owner: z.string().nullable().default(null),
    priority: z.string().nullable().default(null),
  })
  .strict();
export const DecisionSchema = z
  .object({
    ...common,
    title: z.string().min(1),
    context: z.string().nullable(),
    decision: z.string().min(1),
    rationale: z.string().nullable(),
    consequences: z.string().nullable(),
    sourceStatus: z.string().nullable(),
  })
  .strict();
export const IssueSchema = z
  .object({ code: z.string(), message: z.string(), sourceIds: z.array(z.string()) })
  .strict();
export const MappingSchema = z
  .object({
    areas: z.array(AreaSchema).default([]),
    assignments: z
      .array(z.object({ sourceId: z.string(), areaId: z.string() }).strict())
      .default([]),
    excludeIds: z.array(z.string()).default([]),
    systems: z.array(SystemSchema).default([]),
    relations: z.array(RelationSchema).default([]),
    sequences: z.array(SequenceSchema).default([]),
    requirements: z.array(NoteSchema).default([]),
    workshop: z.array(NoteSchema).default([]),
    decisions: z.array(DecisionSchema).default([]),
  })
  .strict();
export const ModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: SourceSchema,
    areas: z.array(AreaSchema),
    systems: z.array(SystemSchema),
    relations: z.array(RelationSchema),
    sequences: z.array(SequenceSchema),
    requirements: z.array(NoteSchema),
    workshop: z.array(NoteSchema),
    decisions: z.array(DecisionSchema),
    issues: z.array(IssueSchema),
  })
  .strict();
export type Model = z.infer<typeof ModelSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Mapping = z.infer<typeof MappingSchema>;
export type Origin = z.infer<typeof OriginSchema>;
export const contentKeys = [
  'systems',
  'relations',
  'sequences',
  'requirements',
  'workshop',
  'decisions',
] as const;
