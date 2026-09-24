import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<body></body>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
let count = 0;
async function walk(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('.mmd')) {
      await mermaid.parse(await readFile(file, 'utf8'));
      count++;
    }
  }
}
for (const path of process.argv.slice(2)) await walk(path);
console.log(JSON.stringify({ validMermaidFiles: count }));
