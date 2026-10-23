// The page has no build step, so a typo in a file name or an import would only
// show up in the browser. These checks catch it earlier: every client module
// must parse, and every relative import must name an existing file and export.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';

const CLIENT = new URL('../src/client/', import.meta.url).pathname;

function modules(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return modules(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const files = modules(CLIENT);

test('every client module parses', () => {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative(CLIENT, file)}: ${result.stderr}`);
  }
});

test('relative imports name existing files and exports', () => {
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, names, target] of source.matchAll(importPattern)) {
      const path = join(dirname(file), target);
      assert.ok(existsSync(path), `${relative(CLIENT, file)} imports a missing file ${target}`);
      const exported = readFileSync(path, 'utf8');
      for (const name of names.split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        const escaped = name.replace(/\$/g, '\\$');
        const pattern = new RegExp(
          `export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+${escaped}(?![\\w$])|export\\s*\\{[^}]*(?:^|[\\s,])${escaped}(?:[\\s,]|$)[^}]*\\}`,
          'm',
        );
        assert.match(exported, pattern, `${relative(CLIENT, file)} imports "${name}", which ${target} does not export`);
      }
    }
  }
});

test('index.html loads the entry module and the screens it needs exist', () => {
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  for (const id of ['view-loading', 'view-auth', 'view-create', 'view-game', 'topbar', 'screen', 'nav-main', 'nav-character', 'sheet', 'toast']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html has no #${id}`);
  }
});

test('every inner region has its picture', async () => {
  const { areaArtIds } = await import('../src/client/area-art.js');
  const regions = JSON.parse(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const areas = regions.flatMap((region) => region.areas.map((area) => area.id));
  assert.deepEqual(areas.filter((id) => !areaArtIds.includes(id)), []);
});
