import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

test('chaque action externe est épinglée par SHA de commit (avec sa version en commentaire)', () => {
  const bad = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
      if (m[1].startsWith('./')) continue;
      if (!/@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v\d/.test(m[2])) bad.push(`${f}: ${m[1]}${m[2]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('droits minimaux : lecture seule au niveau du workflow, Pages réservé au job de déploiement', () => {
  for (const f of files) assert.match(read(f), /^permissions:\n\s+contents: read\s*$/m, `${f}: permissions de niveau workflow manquantes`);
  const pages = read('pages.yml');
  const top = pages.split(/^jobs:/m)[0];
  assert.doesNotMatch(top, /pages: write|id-token: write/, 'pages.yml : droits Pages au niveau workflow');
  const deploy = pages.split(/^  deploy:/m)[1];
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
});

test('concurrence : un run de PR n\'interrompt jamais un déploiement de main', () => {
  const pages = read('pages.yml');
  assert.match(pages, /group: pages-\$\{\{ github\.ref \}\}/);
  assert.match(pages, /cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/);
  const deploy = pages.split(/^  deploy:/m)[1];
  assert.match(deploy, /group: pages\n\s+cancel-in-progress: false/);
});

test('le robot de synchronisation lance les contrôles sur sa branche (ses PR ne déclenchent pas la CI)', () => {
  const sync = read('catalog-sync.yml');
  assert.match(sync, /gh workflow run pages\.yml --ref "\$BRANCH"/);
  const top = sync.split(/^jobs:/m)[0];
  assert.doesNotMatch(top, /actions: write/, 'actions: write ne doit être accordé qu\'au job, pas au workflow');
  assert.match(sync.split(/^jobs:/m)[1], /actions: write/);
  assert.match(read('pages.yml'), /^\s+workflow_dispatch:/m, 'pages.yml doit accepter le lancement manuel');
  // seul main déploie : un lancement sur la branche du robot ne publie rien
  assert.match(read('pages.yml'), /deploy:\n\s+if: github\.ref == 'refs\/heads\/main'/);
});

test('Dependabot surveille les actions et npm', () => {
  assert.ok(existsSync(new URL('../.github/dependabot.yml', import.meta.url)));
  const d = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  assert.match(d, /package-ecosystem: github-actions/);
  assert.match(d, /package-ecosystem: npm/);
});
