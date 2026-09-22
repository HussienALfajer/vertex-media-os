/**
 * Regenerates the committed CSS artifacts from src/tokens/tokens.json.
 * `--check` fails instead of writing when the artifacts are stale (the token tests also
 * assert this, so a hand edit or forgotten regeneration fails `pnpm test`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateTokens } from './token-engine.mjs';

const source = JSON.parse(
  await readFile(new URL('../src/tokens/tokens.json', import.meta.url), 'utf8'),
);
const directory = new URL('../src/generated/', import.meta.url);
const check = process.argv.includes('--check');
await mkdir(directory, { recursive: true });
for (const [name, content] of Object.entries(generateTokens(source))) {
  const file = new URL(name, directory);
  if (!check) await writeFile(file, content);
  else if ((await readFile(file, 'utf8').catch(() => '')) !== content)
    throw new Error(`Stale generated ${name}; run: pnpm nx run @vertex-os/ui:tokens`);
}
