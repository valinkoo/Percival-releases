// Checks that the desktop app version is identical in the three files that carry it, and,
// when a tag is given (v1.2.3), that it matches the tag. Used by the release workflow and
// runnable by hand: node scripts/check-version.mjs [v1.2.3]
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const versions = {
  'apps/desktop/src-tauri/tauri.conf.json': JSON.parse(
    read('apps/desktop/src-tauri/tauri.conf.json'),
  ).version,
  'apps/desktop/src-tauri/Cargo.toml': /^version\s*=\s*"([^"]+)"/m.exec(
    read('apps/desktop/src-tauri/Cargo.toml'),
  )?.[1],
  'apps/desktop/package.json': JSON.parse(read('apps/desktop/package.json')).version,
};

const tag = process.argv[2];
const expected = tag ? tag.replace(/^v/, '') : Object.values(versions)[0];

let failed = false;
for (const [file, version] of Object.entries(versions)) {
  const ok = version === expected;
  failed ||= !ok;
  console.log(`${ok ? 'ok ' : 'ERR'} ${file}: ${version ?? 'not found'}`);
}

if (failed) {
  console.error(
    tag
      ? `\nThe app version must be ${expected} everywhere to release ${tag}.`
      : '\nThe app version differs between files.',
  );
  process.exit(1);
}
console.log(`\nApp version ${expected}${tag ? ` matches ${tag}` : ''}.`);
