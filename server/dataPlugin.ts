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
const KEEP_BACKUPS = 60;

export function dataPlugin(dataDir: string): Plugin {
  const backupDir = path.join(dataDir, '.sauvegardes');

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
    const file = path.join(dataDir, `${name}.json`);
    try {
      await fs.mkdir(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.copyFile(file, path.join(backupDir, `${name}-${stamp}.json`));
      const old = (await fs.readdir(backupDir)).filter((f) => f.startsWith(`${name}-`)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
        await fs.unlink(path.join(backupDir, f));
      }
    } catch {
      // pas de fichier précédent : rien à sauvegarder
    }
  }

  async function write(name: string, value: unknown) {
    const file = path.join(dataDir, `${name}.json`);
    const tmp = `${file}.tmp`;
    await fs.mkdir(dataDir, { recursive: true });
    await backup(name);
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, file);
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
          const name = (req.url ?? '/').replace(/^\//, '').replace(/\?.*$/, '');
          if (req.method === 'GET' && name === '') return send(200, await readAll());
          if (req.method === 'PUT' && (FILES as readonly string[]).includes(name)) {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            await write(name, value);
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
