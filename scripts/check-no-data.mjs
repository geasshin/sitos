#!/usr/bin/env node
/**
 * Refuse un fichier de données personnelles suivi par Git.
 *
 * Le dépôt est public. `data/` contient le stock, le plan, les recettes, le
 * journal et les pesées de la personne qui utilise Sitos : il ne doit jamais
 * entrer dans l'index, même par un `git add -f` ou un `.gitignore` cassé.
 *
 * Le contrôle lit l'index (`git ls-files`), pas le disque : un fichier ignoré
 * peut exister dans le dossier de travail, seul un fichier suivi est un défaut.
 */
import { execFileSync } from 'node:child_process';

let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
} catch (error) {
  console.error('check:data : impossible de lire l’index Git.', error.message);
  process.exit(1);
}

const personal = tracked.filter(
  (file) =>
    file === 'data' ||
    file.startsWith('data/') ||
    file === '.sauvegardes' ||
    file.startsWith('.sauvegardes/') ||
    file.includes('/.sauvegardes/') ||
    /(^|\/)sitos-(export|recettes)-\d{4}-\d{2}-\d{2}\.json$/.test(file),
);

if (personal.length > 0) {
  console.error('Données personnelles suivies par Git :');
  for (const file of personal) console.error(`  ${file}`);
  console.error('');
  console.error('Retire-les de l’index avec `git rm --cached <fichier>` et garde `data/` dans .gitignore.');
  console.error('Si elles ont déjà été poussées, l’historique doit être nettoyé avant de publier.');
  process.exit(1);
}

console.log(`check:data : aucun fichier de données suivi (${tracked.length} fichiers vérifiés).`);
