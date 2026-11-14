import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const MERGE = join(ROOT, 'scripts/merge-tauri-latest-json.mjs')
const VERSION = join(ROOT, 'scripts/prepare-tauri-release-version.mjs')
const SIG = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUeGM1bndiVlc3cmtGb3JUZXN0c09ubHlBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB'

const scratch = () => mkdtempSync(join(tmpdir(), 'sitos-release-'))
const run = (args, cwd = ROOT) => spawnSync('node', [MERGE, ...args], { cwd, encoding: 'utf8' })

test('le job publish assemble un manifeste macOS complet (arm + intel)', () => {
  const dir = scratch()
  writeFileSync(join(dir, 'a.sig'), SIG)
  writeFileSync(join(dir, 'notes.md'), 'Première version.')
  const out = join(dir, 'latest.json')
  const url = 'https://github.com/geasshin/sitos/releases/download/v0.1.0/Sitos.app.tar.gz'
  assert.equal(run(['--manifest', 'none', '--version', '0.1.0', '--notes-file', join(dir, 'notes.md'), '--platform', 'darwin-aarch64', '--url', url, '--signature-file', join(dir, 'a.sig'), '--output', out]).status, 0)
  assert.equal(run(['--manifest', out, '--version', '0.1.0', '--alias', 'darwin-aarch64:darwin-x86_64', '--output', out]).status, 0)
  const ok = run(['--check', out, '--version', '0.1.0', '--require', 'darwin-aarch64', '--require', 'darwin-x86_64'])
  assert.equal(ok.status, 0, ok.stderr)
  const manifest = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64'])
  assert.equal(manifest.platforms['darwin-x86_64'].url, url)
})

test('un manifeste sans la cible Intel est refusé', () => {
  const dir = scratch()
  writeFileSync(join(dir, 'a.sig'), SIG)
  const out = join(dir, 'latest.json')
  run(['--manifest', 'none', '--version', '0.1.0', '--platform', 'darwin-aarch64', '--url', 'https://github.com/geasshin/sitos/releases/download/v0.1.0/Sitos.app.tar.gz', '--signature-file', join(dir, 'a.sig'), '--output', out])
  const res = run(['--check', out, '--version', '0.1.0', '--require', 'darwin-aarch64', '--require', 'darwin-x86_64'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /darwin-x86_64/)
})

test('une archive hors du dépôt sitos est refusée', () => {
  const dir = scratch()
  writeFileSync(join(dir, 'a.sig'), SIG)
  const res = run(['--manifest', 'none', '--version', '0.1.0', '--platform', 'darwin-aarch64', '--url', 'https://github.com/geasshin/sylloge/releases/download/v0.1.0/Sitos.app.tar.gz', '--signature-file', join(dir, 'a.sig'), '--output', join(dir, 'x.json')])
  assert.notEqual(res.status, 0)
})

function versionRepo(tags) {
  const dir = scratch()
  for (const f of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
    mkdirSync(join(dir, f, '..'), { recursive: true })
    cpSync(join(ROOT, f), join(dir, f))
  }
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x')
  for (const t of tags) git('tag', t)
  const env = { ...process.env }
  delete env.GITHUB_OUTPUT
  delete env.SITOS_RELEASE_VERSION
  return execFileSync('node', [VERSION], { cwd: dir, encoding: 'utf8', env }).trim()
}

test('la première release porte la version de base, les suivantes un correctif de plus', () => {
  const base = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version
  const [a, b, c] = base.split('.').map(Number)
  assert.equal(versionRepo([]), base)
  assert.equal(versionRepo([`v${base}`]), `${a}.${b}.${c + 1}`)
  assert.equal(versionRepo([`v${base}`, `v${a}.${b}.${c + 4}`]), `${a}.${b}.${c + 5}`)
})
