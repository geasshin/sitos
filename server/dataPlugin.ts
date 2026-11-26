import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Pour développer dans le navigateur (`npm run dev`) : l'app lit et écrit les JSON de data/.
 * L'application installée n'utilise pas ce plugin : ses commandes natives (src-tauri/src/data.rs)
 * font la même chose dans le dossier de l'app.
 * Avant chaque écriture, la version précédente part dans data/.sauvegardes/
 * (les 60 plus récentes par fichier sont gardées). Rien ne sort de la machine.
 */
const FILES = ['foods', 'stock', 'recipes', 'plan', 'journal', 'settings', 'snackIdeas'] as const;
type Collection = (typeof FILES)[number];
const KEEP_BACKUPS = 60;

export interface BackupFile {
  name: string;
  collection: Collection;
  /** Date du fichier, en millisecondes depuis 1970. */
  savedAt: number;
  bytes: number;
}

/** Le nom d'une copie désigne une collection connue et rien d'autre : jamais un chemin. */
function collectionOf(name: string): Collection | null {
  if (!name || path.basename(name) !== name || !name.endsWith('.json')) return null;
  return FILES.find((file) => name.startsWith(`${file}-`)) ?? null;
}

function backupDirOf(dataDir: string): string {
  return path.join(dataDir, '.sauvegardes');
}

/** Les copies automatiques, de la plus récente à la plus ancienne. */
export async function listBackupFiles(dataDir: string): Promise<BackupFile[]> {
  const dir = backupDirOf(dataDir);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: BackupFile[] = [];
  for (const name of names) {
    const collection = collectionOf(name);
    if (!collection) continue;
    try {
      const stat = await fs.stat(path.join(dir, name));
      if (!stat.isFile()) continue;
      out.push({ name, collection, savedAt: Math.round(stat.mtimeMs), bytes: stat.size });
    } catch {
      // fichier disparu entre la lecture du dossier et son examen
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Le contenu d'une copie, pour l'afficher avant de restaurer. */
export async function readBackupValue(dataDir: string, name: string): Promise<unknown> {
  if (!collectionOf(name)) throw new Error('nom de sauvegarde invalide');
  const raw = await fs.readFile(path.join(backupDirOf(dataDir), name), 'utf8');
  return JSON.parse(raw);
}

/** Copie l'état courant d'une collection dans .sauvegardes. Renvoie le nom créé. */
async function backupFile(dataDir: string, name: string, strict: boolean): Promise<string | null> {
  const file = path.join(dataDir, `${name}.json`);
  const dir = backupDirOf(dataDir);
  try {
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(dir, `${name}-${stamp}.json`);
    await fs.copyFile(file, target);
    const old = (await fs.readdir(dir)).filter((f) => f.startsWith(`${name}-`)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
      await fs.unlink(path.join(dir, f));
    }
    return path.basename(target);
  } catch (error) {
    if (strict) throw error;
    // pas de fichier précédent : rien à sauvegarder
    return null;
  }
}

/**
 * Remet une copie à la place de sa collection. L'état courant est copié avant
 * toute écriture, puis la copie est installée par un renommage : une coupure au
 * mauvais moment laisse l'ancien fichier intact.
 */
export async function restoreBackupFile(
  dataDir: string,
  name: string,
): Promise<{ collection: Collection; backup: string | null; bytes: number }> {
  const collection = collectionOf(name);
  if (!collection) throw new Error('nom de sauvegarde invalide');
  const source = path.join(backupDirOf(dataDir), name);
  const text = await fs.readFile(source, 'utf8');
  try {
    JSON.parse(text);
  } catch {
    throw new Error('Cette sauvegarde n’est pas du JSON lisible : rien n’a été écrit.');
  }

  const target = path.join(dataDir, `${collection}.json`);
  let current = true;
  try {
    await fs.access(target);
  } catch {
    current = false;
  }
  const backup = current ? await backupFile(dataDir, collection, true) : null;

  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.copyFile(source, tmp);
  await fs.rename(tmp, target);
  return { collection, backup, bytes: (await fs.stat(target)).size };
}

export function dataPlugin(dataDir: string): Plugin {
  async function readAll() {
    const out: Record<string, unknown> = {};
    for (const name of FILES) {
      let raw: string;
      try {
        raw = await fs.readFile(path.join(dataDir, `${name}.json`), 'utf8');
      } catch {
        continue; // absent : l'app part des valeurs de starter/
      }
      out[name] = JSON.parse(raw);
    }
    return out;
  }

  async function backup(name: string) {
    await backupFile(dataDir, name, false);
  }

  async function write(name: string, value: unknown) {
    const file = path.join(dataDir, `${name}.json`);
    const tmp = `${file}.tmp`;
    await fs.mkdir(dataDir, { recursive: true });
    await backup(name);
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, file);
  }

  async function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  return {
    name: 'sitos-data',
    configureServer(server) {
      server.middlewares.use('/api/data', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        try {
          const url = new URL(req.url ?? '/', 'http://sitos.local');
          const name = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');

          if (req.method === 'GET' && name === '') return send(200, await readAll());

          if (req.method === 'GET' && name === 'backups') return send(200, await listBackupFiles(dataDir));

          if (req.method === 'GET' && name === 'backups/file') {
            const file = url.searchParams.get('name') ?? '';
            return send(200, { value: await readBackupValue(dataDir, file) });
          }

          if (req.method === 'POST' && name === 'backups/restore') {
            const body = (await readBody(req)) as { name?: unknown };
            if (typeof body.name !== 'string' || !body.name) return send(400, { error: 'nom de sauvegarde manquant' });
            return send(200, await restoreBackupFile(dataDir, body.name));
          }

          if (req.method === 'PUT' && (FILES as readonly string[]).includes(name)) {
            await write(name, await readBody(req));
            return send(200, { ok: true });
          }

          return send(404, { error: 'Ressource inconnue' });
        } catch (err) {
          return send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
