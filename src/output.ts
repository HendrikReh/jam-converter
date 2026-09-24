import { lstat, readFile, writeFile, mkdir, mkdtemp, rename, rm, cp } from 'node:fs/promises';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { renderFiles } from './render.ts';
import { validateModel } from './validate.ts';
import type { Model } from './model.ts';
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const manifestName = '.jam-converter.json';
const Manifest = z
  .object({
    version: z.literal(1),
    files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  })
  .strict();
async function exists(p: string) {
  try {
    return await lstat(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
export async function safePath(root: string, path: string): Promise<string> {
  const target = resolve(root, path);
  if (
    isAbsolute(path) ||
    !path ||
    path.includes('\\') ||
    path.split('/').some((x) => x === '..' || x === '.') ||
    relative(resolve(root), target).startsWith('..')
  )
    throw new Error(`Unsafe path: ${path}`);
  let current = resolve(root);
  for (const part of ['', ...path.split('/')]) {
    if (part) current = join(current, part);
    const st = await exists(current);
    if (st?.isSymbolicLink()) throw new Error(`Symlink not allowed: ${current}`);
  }
  return target;
}
export async function loadAssets(model: Model, base: string): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  for (const a of model.source.assets) {
    const path = await safePath(base, a.path);
    const data = await readFile(path);
    if (hash(data) !== a.sha256) throw new Error(`Asset checksum mismatch: ${a.id}`);
    result.set(a.path, data);
  }
  return result;
}
export async function writeOutput(
  dir: string,
  input: Model,
  assets: Map<string, Uint8Array>,
  overwrite = false,
): Promise<void> {
  const model = validateModel(input),
    files = new Map<string, string | Uint8Array>(renderFiles(model));
  for (const a of model.source.assets) {
    const bytes = assets.get(a.path);
    if (!bytes || hash(bytes) !== a.sha256) throw new Error(`Missing or modified asset: ${a.id}`);
    files.set(a.path, bytes);
  }
  const target = resolve(dir);
  const st = await exists(target);
  if (st?.isSymbolicLink()) throw new Error('Output is a symlink');
  if (st && !st.isDirectory()) throw new Error('Output exists and is not a directory');
  if (st && !overwrite)
    throw new Error('Output already exists; use --overwrite for managed output');
  let old: Record<string, string> = {};
  if (st) {
    const manifestPath = await safePath(target, manifestName);
    try {
      old = Manifest.parse(JSON.parse(await readFile(manifestPath, 'utf8'))).files;
    } catch {
      throw new Error('Existing output has no valid converter manifest');
    }
    for (const [path, digest] of Object.entries(old)) {
      const full = await safePath(target, path);
      const existing = await exists(full);
      if (existing && (!existing.isFile() || hash(await readFile(full)) !== digest))
        throw new Error(`Managed file modified / geändert: ${path}`);
    }
  }
  for (const path of files.keys()) {
    const full = await safePath(target, path);
    if (st && (await exists(full)) && !Object.hasOwn(old, path))
      throw new Error(`Unmanaged file collision: ${path}`);
  }
  await mkdir(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), '.jam-stage-'));
  let backup: string | undefined;
  try {
    if (st) await cp(target, stage, { recursive: true, dereference: false });
    for (const path of Object.keys(old))
      if (!files.has(path)) await rm(await safePath(stage, path), { force: true });
    const entries: Record<string, string> = {};
    for (const [path, data] of files) {
      const full = await safePath(stage, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
      entries[path] = hash(data);
    }
    await writeFile(
      join(stage, manifestName),
      JSON.stringify({ version: 1, files: entries }, null, 2) + '\n',
    );
    if (st) {
      backup = stage + '-previous';
      await rename(target, backup);
    }
    try {
      await rename(stage, target);
    } catch (error) {
      if (backup) await rename(backup, target);
      backup = undefined;
      throw error;
    }
    if (backup) await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
