import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, HardDrive, Loader2, Monitor, Moon, RefreshCw, RotateCcw, Sun, Trash2, Utensils } from 'lucide-react';
import { useApp } from '../context';
import { GoalsCard } from '../components/Goals';
import { Sheet, SheetActions } from '../components/Sheet';
import { todayISO } from '../domain/dates';
import type { Data } from '../domain/types';
import {
  applyTheme,
  buildExport,
  buildRecipesExport,
  clearErrorLog,
  COLLECTION_LABELS,
  countData,
  createBackup,
  describeBackup,
  downloadJson,
  exportFileName,
  getBackupInfo,
  getDataFolder,
  importData,
  isNative,
  KEYS,
  listBackups,
  loadData,
  mergeRecipes,
  onErrorLogChange,
  openDataFolder,
  openLink,
  readBackup,
  readErrorLog,
  readImport,
  restoreBackup,
  type BackupEntry,
  type BackupInfo,
  type DataCounts,
  type ErrorEntry,
  type ExportKind,
  type ImportPreview,
  type Key,
} from '../storage';
import { appVersion, checkForUpdate, installUpdate, useUpdates } from '../updates';
import { clearCoverCache, coverCacheSize } from '../imageCache';
import './settings-v3.css';

const THEMES = [
  ['system', 'Comme le Mac', Monitor],
  ['light', 'Clair', Sun],
  ['dark', 'Sombre', Moon],
] as const;

const THEME_LABEL: Record<'system' | 'light' | 'dark', string> = {
  system: 'Apparence du Mac',
  light: 'Clair',
  dark: 'Sombre',
};

const SECTIONS = [
  { id: 'set-repas', label: 'Repas et objectifs', tone: 'is-mint', Icon: Utensils },
  { id: 'set-apparence', label: 'Apparence', tone: 'is-lilac', Icon: Sun },
  { id: 'set-maj', label: 'Mises à jour', tone: 'is-butter', Icon: RefreshCw },
  { id: 'set-donnees', label: 'Données', tone: 'is-sky', Icon: HardDrive },
] as const;

const backupDate = (name: string) => {
  const m = /manuel-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  return m ? `${m[3]}/${m[2]}/${m[1]} à ${m[4]} h ${m[5]}` : name;
};

const backupWhen = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
};

const errorWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const countsSentence = (c: DataCounts) =>
  `${plural(c.recipes, 'recette', 'recettes')}, ${plural(c.purchases, 'achat', 'achats')}, ${plural(c.weights, 'pesée', 'pesées')} et ${plural(c.foods, 'aliment', 'aliments')}`;

/** Le compte-rendu d'un import de recettes seules : reprises, nouvelles, mises à jour. */
const recipesSentence = (r: ImportReport) => {
  const detail = [
    r.added ? plural(r.added, 'nouvelle', 'nouvelles') : '',
    r.updated ? plural(r.updated, 'mise à jour', 'mises à jour') : '',
  ].filter(Boolean);
  return `${plural(r.counts.recipes, 'recette reprise', 'recettes reprises')}${detail.length ? `, dont ${detail.join(' et ')}` : ''}.`;
};

const exportDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

interface PendingImport {
  fileName: string;
  preview: ImportPreview;
}

interface ImportReport {
  kind: ExportKind;
  counts: DataCounts;
  before: DataCounts;
  added?: number;
  updated?: number;
  kept?: number;
}

interface RestoreTarget {
  entry: BackupEntry;
  /** Ce que contient la copie, écrit avant la confirmation. */
  facts: string[];
}

interface RestoreReport {
  collection: Key;
  facts: string[];
  /** Copie de l’état d’avant, faite avant d’écrire. */
  backup: string | null;
  before: DataCounts;
  after: DataCounts;
}

/**
 * Les réglages de Sitos, en quatre blocs : ce que l’app compte (repas, objectifs),
 * la lumière (thème), la veille (mises à jour) et les fichiers (données).
 * Chaque ligne dit ce qu’elle change ; les choix numériques se font au doigt,
 * dans un sélecteur segmenté, jamais dans une liste qu’il faut dérouler.
 */
export function SettingsView() {
  const { data, store } = useApp();
  const s = data.settings;
  const u = useUpdates();
  const [version, setVersion] = useState<string>();
  const [folder, setFolder] = useState<string>();
  const [backups, setBackups] = useState<BackupInfo>();
  const [backupState, setBackupState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [backupList, setBackupList] = useState<BackupEntry[]>();
  const [listState, setListState] = useState<'idle' | 'loading' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [restoreWord, setRestoreWord] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [covers, setCovers] = useState<{ count: number; bytes: number }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ fileName: string; reason: string } | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const refreshBackups = () => {
    void getBackupInfo()
      .then(setBackups)
      .catch(() => setBackups(undefined));
    setListState('loading');
    setListError(null);
    void listBackups()
      .then((list) => {
        setBackupList(list);
        setListState('idle');
      })
      .catch((e: unknown) => {
        setBackupList(undefined);
        setListState('error');
        setListError(e instanceof Error ? e.message : String(e));
      });
  };

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => undefined);
    void getDataFolder().then(setFolder).catch(() => undefined);
    void coverCacheSize().then(setCovers).catch(() => undefined);
    refreshBackups();
    setErrors(readErrorLog());
    return onErrorLogChange(() => setErrors(readErrorLog()));
  }, []);

  const setSettings = (patch: Partial<typeof s>) => store.update('settings', (x) => ({ ...x, ...patch }));
  const auto = s.autoUpdate !== false;
  const meals = s.mealsPerDay ?? 1;
  const cook = s.mealsPerCook ?? 2;
  const theme = s.theme ?? 'system';
  const checking = u.phase === 'checking';
  const installing = u.phase === 'installing';
  const versionLabel = version ?? (isNative ? '…' : 'dev');

  const tiles: [string, number][] = !pending
    ? []
    : pending.preview.kind === 'complet'
      ? [
          ['recettes', pending.preview.counts.recipes],
          ['achats', pending.preview.counts.purchases],
          ['pesées', pending.preview.counts.weights],
          ['aliments', pending.preview.counts.foods],
        ]
      : [['recettes', pending.preview.counts.recipes]];

  const mealsHint =
    meals === 1
      ? 'Un seul grand repas ; les compléments complètent la journée.'
      : `Les objectifs se partagent entre les ${meals} repas de la journée.`;
  const cookHint = `Quand la fiche ne le précise pas, une cuisson donne ${cook} repas.`;

  const backupText =
    backupState === 'done'
      ? 'Sauvegarde faite.'
      : backupState === 'error'
        ? 'La sauvegarde a échoué. Réessaie dans un instant.'
        : backupState === 'saving'
          ? 'Copie en cours…'
          : backups && backups.manual.length > 0
            ? `Dernière : ${backupDate(backups.manual[0])}${backups.manual.length > 1 ? ` (${backups.manual.length} en tout)` : ''}`
            : 'Aucune sauvegarde manuelle pour l’instant.';

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
  };

  const exportAll = () => {
    const now = new Date();
    const name = exportFileName('complet', now);
    downloadJson(name, buildExport(data, now));
    setExported(name);
  };

  const exportRecipes = () => {
    const now = new Date();
    const name = exportFileName('recettes', now);
    downloadJson(name, buildRecipesExport(data, now));
    setExported(name);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setRefusal(null);
    setReport(null);
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRefusal({ fileName: file.name, reason: 'Le fichier n’a pas pu être lu.' });
      return;
    }
    const read = readImport(text, data.foods);
    if (!read.ok) {
      setRefusal({ fileName: file.name, reason: read.reason });
      return;
    }
    setPending({ fileName: file.name, preview: read.preview });
    setReviewOpen(true);
  };

  const closeReview = () => {
    if (importing) return;
    setReviewOpen(false);
    setPending(null);
    setImportError(null);
  };

  const confirmImport = async () => {
    if (!pending || importing) return;
    setImporting(true);
    setImportError(null);
    const before = countData(data);
    const preview = pending.preview;
    let next: Data;
    let merged: ReturnType<typeof mergeRecipes> | undefined;
    if (preview.kind === 'complet' && preview.data) {
      next = preview.data;
    } else {
      merged = mergeRecipes(data.recipes, preview.recipes ?? []);
      next = { ...data, recipes: merged.recipes };
    }
    try {
      const written = await importData(next, data, todayISO());
      // Seules les collections dont le contenu a changé entrent dans l’app :
      // un import de recettes ne réécrit pas le stock ni le journal.
      const changed = KEYS.filter((key) => JSON.stringify(written.data[key]) !== JSON.stringify(data[key]));
      for (const key of changed) store.update(key, () => written.data[key]);
      void applyTheme(written.data.settings.theme ?? 'system');
      setReport({
        kind: preview.kind,
        counts: written.counts,
        before,
        added: merged?.added,
        updated: merged?.updated,
        kept: merged?.kept,
      });
      setReviewOpen(false);
      setPending(null);
      refreshBackups();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const openRestore = async (entry: BackupEntry) => {
    setListError(null);
    setRestoreReport(null);
    setRestoreError(null);
    setRestoreWord('');
    try {
      const value = await readBackup(entry.name);
      setRestoreTarget({ entry, facts: describeBackup(entry.collection, value) });
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };

  const closeRestore = () => {
    if (restoring) return;
    setRestoreTarget(null);
    setRestoreWord('');
    setRestoreError(null);
  };

  const restoreConfirmed = restoreWord.trim().toLocaleLowerCase('fr-FR') === 'restaurer';

  const confirmRestore = async () => {
    if (!restoreTarget || restoring || !restoreConfirmed) return;
    setRestoring(true);
    setRestoreError(null);
    const before = countData(data);
    try {
      const result = await restoreBackup(restoreTarget.entry.name);
      // Relire le disque : le compte-rendu dit ce qui est réellement repris, pas ce qui était prévu.
      const loaded = await loadData(todayISO());
      // Seule la collection restaurée entre dans l’app : les autres restent telles
      // qu’elles sont en mémoire, et les réglages ne sont pas réécrits pour rien.
      const value = loaded.data[result.collection];
      if (JSON.stringify(value) !== JSON.stringify(data[result.collection])) {
        store.update(result.collection, () => value);
      }
      if (result.collection === 'settings') void applyTheme(loaded.data.settings.theme ?? 'system');
      setRestoreReport({
        collection: result.collection,
        facts: describeBackup(result.collection, loaded.data[result.collection]),
        backup: result.backup,
        before,
        after: countData(loaded.data),
      });
      setRestoreTarget(null);
      setRestoreWord('');
      refreshBackups();
      setErrors(readErrorLog());
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="s-page set-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Paramètres</h1>
          <p className="s-subtitle">Repas, apparence, mises à jour et fichiers.</p>
        </div>
        <div className="set-head-chips">
          <span className="s-chip is-mint">
            <b className="num">{meals}</b> repas par jour
          </span>
          <span className="s-chip is-lilac">{THEME_LABEL[theme]}</span>
        </div>
      </header>

      <nav className="set-sommaire" aria-label="Sommaire des paramètres">
        <span className="set-sommaire-label">Au sommaire</span>
        {SECTIONS.map(({ id, label, tone, Icon }) => (
          <button key={id} type="button" className="set-sommaire-link" onClick={() => jump(id)}>
            <span className={`set-badge ${tone}`} aria-hidden>
              <Icon size={14} />
            </span>
            {label}
          </button>
        ))}
      </nav>

      <div className="set-cols">
        <div className="set-col">
          <section id="set-repas" className="s-card set-card" aria-labelledby="set-repas-titre">
            <header className="set-card-head">
              <span className="set-badge is-mint" aria-hidden>
                <Utensils size={17} />
              </span>
              <div>
                <h2 id="set-repas-titre">Repas et objectifs</h2>
                <p>Ce que l’app compte dans une journée, et ce qu’elle vise pour toi.</p>
              </div>
            </header>

            <div className="set-rows">
              <div className="set-row">
                <div className="set-row-text">
                  <p className="set-row-title">Repas principaux par jour</p>
                  <p className="set-row-sub">{mealsHint}</p>
                </div>
                <div className="set-seg" role="radiogroup" aria-label="Repas principaux par jour">
                  {([1, 2, 3] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={meals === k}
                      aria-label={`${k} repas par jour`}
                      className={meals === k ? 'is-on' : undefined}
                      onClick={() => {
                        setSettings({ mealsPerDay: k, mealShare: k === 1 ? 0.75 : k === 2 ? 0.45 : 0.35 });
                        if (s.profile)
                          setSettings({
                            profile: { ...s.profile, rhythm: k === 1 ? 'un-repas' : k === 2 ? 'deux-repas' : 'trois-repas' },
                          });
                      }}
                    >
                      <b className="num">{k}</b>
                      <span>repas</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="set-row">
                <div className="set-row-text">
                  <p className="set-row-title">Repas par cuisson</p>
                  <p className="set-row-sub">{cookHint}</p>
                </div>
                <div className="set-seg" role="radiogroup" aria-label="Repas par cuisson">
                  {([2, 3, 4] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={cook === k}
                      aria-label={`${k} repas par cuisson`}
                      className={cook === k ? 'is-on' : undefined}
                      onClick={() => setSettings({ mealsPerCook: k })}
                    >
                      <b className="num">{k}</b>
                      <span>repas</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="set-goals">
              <GoalsCard />
            </div>
          </section>

          <section id="set-apparence" className="s-card set-card" aria-labelledby="set-apparence-titre">
            <header className="set-card-head">
              <span className="set-badge is-lilac" aria-hidden>
                <Sun size={17} />
              </span>
              <div>
                <h2 id="set-apparence-titre">Apparence</h2>
                <p>La lumière de l’app, sans redémarrer.</p>
              </div>
            </header>

            <div className="set-row">
              <div className="set-row-text">
                <p className="set-row-title">Thème</p>
                <p className="set-row-sub">Le clair est la référence ; le sombre reste à finir.</p>
              </div>
            </div>

            <div className="set-themes" role="radiogroup" aria-label="Apparence">
              {THEMES.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  className={`set-theme ${theme === id ? 'is-on' : ''}`}
                  onClick={() => {
                    setSettings({ theme: id });
                    void applyTheme(id);
                  }}
                >
                  <Icon size={17} aria-hidden />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="set-col">
          <section id="set-maj" className="s-card set-card" aria-labelledby="set-maj-titre">
            <header className="set-card-head">
              <span className="set-badge is-butter" aria-hidden>
                <RefreshCw size={16} />
              </span>
              <div>
                <h2 id="set-maj-titre">Mises à jour</h2>
                <p>{isNative ? 'La version installée et sa veille.' : 'Le code tourne depuis le dépôt.'}</p>
              </div>
            </header>

            <div className="set-version">
              <div>
                <p className="set-version-label">{isNative ? 'Version installée' : 'Version de développement'}</p>
                <p className="set-version-name">
                  Sitos <b className="num">{versionLabel}</b>
                </p>
              </div>
              {isNative ? (
                <button
                  type="button"
                  className="s-btn is-sm"
                  onClick={() => void checkForUpdate(true)}
                  disabled={checking || installing}
                >
                  {checking && <Loader2 size={14} className="spin" aria-hidden />}
                  {checking ? 'Recherche…' : 'Rechercher'}
                </button>
              ) : (
                <span className="s-chip is-butter">dev</span>
              )}
            </div>

            <p className="set-note">
              {isNative
                ? 'Le paquet est vérifié (signature) avant d’être installé. Tes données ne bougent pas.'
                : 'Les mises à jour ne concernent que l’application installée.'}
            </p>

            {u.phase !== 'idle' && (
              <div className={`set-status is-${u.phase}`} role="status" aria-live="polite">
                {u.phase === 'checking' && (
                  <p>
                    <Loader2 size={14} className="spin" aria-hidden /> Recherche en cours…
                  </p>
                )}
                {u.phase === 'uptodate' && (
                  <p>
                    <Check size={15} aria-hidden /> Sitos est à jour.
                    {u.checkedAt && (
                      <span className="set-status-soft">
                        Vérifié à {u.checkedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
                      </span>
                    )}
                  </p>
                )}
                {u.phase === 'error' && <p>{u.error}</p>}
                {(u.phase === 'available' || u.phase === 'installing') && u.available && (
                  <div className="set-available">
                    <p>
                      <strong>Sitos {u.available.version}</strong> est disponible.
                    </p>
                    {u.available.notes && <pre className="set-release-notes">{u.available.notes}</pre>}
                    {u.error && <p className="set-error">{u.error}</p>}
                    <button
                      type="button"
                      className="s-btn is-primary is-sm"
                      onClick={() => void installUpdate()}
                      disabled={installing}
                    >
                      {installing ? <Loader2 size={14} className="spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
                      {installing ? 'Installation… Sitos va redémarrer' : 'Installer et redémarrer'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <label className="set-row set-row-toggle">
              <span className="set-row-text">
                <span className="set-row-title">Rechercher automatiquement</span>
                <span className="set-row-sub">À l’ouverture puis toutes les six heures. Rien ne s’installe sans ton accord.</span>
              </span>
              <span className="set-switch">
                <input type="checkbox" checked={auto} onChange={(e) => setSettings({ autoUpdate: e.target.checked })} />
                <span className="set-switch-track" aria-hidden="true">
                  <span />
                </span>
              </span>
            </label>

            <div className="set-foot-link">
              <button type="button" className="set-link" onClick={() => void openLink('releases')}>
                Toutes les versions et leurs notes <ArrowUpRight size={14} aria-hidden />
              </button>
            </div>
          </section>

          <section id="set-donnees" className="s-card set-card" aria-labelledby="set-donnees-titre">
            <header className="set-card-head">
              <span className="set-badge is-sky" aria-hidden>
                <HardDrive size={17} />
              </span>
              <div>
                <h2 id="set-donnees-titre">Données</h2>
                <p>Où elles vivent, et comment les garder.</p>
              </div>
            </header>

            {isNative ? (
              <>
                <div className="set-row">
                  <div className="set-row-text">
                    <p className="set-row-title">Dossier des données</p>
                    <p className="set-row-sub">
                      {folder ? (
                        <code className="set-path" title={folder}>
                          {folder.replace(/^\/Users\/[^/]+/, '~')}
                        </code>
                      ) : (
                        'Un fichier JSON lisible par collection.'
                      )}
                      {backups
                        ? ` · ${backups.automatic} copie${backups.automatic > 1 ? 's' : ''} automatique${backups.automatic > 1 ? 's' : ''}`
                        : ''}
                    </p>
                  </div>
                  <button type="button" className="s-btn is-sm" onClick={() => void openDataFolder()}>
                    Ouvrir
                  </button>
                </div>

                <div className="set-row">
                  <div className="set-row-text">
                    <p className="set-row-title">Sauvegarde manuelle</p>
                    <p className={`set-row-sub ${backupState === 'error' ? 'is-error' : ''}`}>{backupText}</p>
                  </div>
                  <button
                    type="button"
                    className="s-btn is-sm"
                    disabled={backupState === 'saving'}
                    onClick={async () => {
                      setBackupState('saving');
                      try {
                        await createBackup();
                        setBackupState('done');
                        refreshBackups();
                      } catch {
                        setBackupState('error');
                      }
                    }}
                  >
                    {backupState === 'saving' && <Loader2 size={14} className="spin" aria-hidden />}
                    {backupState === 'saving' ? 'Copie…' : 'Sauvegarder'}
                  </button>
                </div>
              </>
            ) : (
              <div className="set-row">
                <div className="set-row-text">
                  <p className="set-row-title">Fichiers</p>
                  <p className="set-row-sub">
                    Dans le navigateur, le dossier <code className="set-path">data/</code> du dépôt.
                  </p>
                </div>
                <span className="s-chip is-sky">mode dev</span>
              </div>
            )}

            <div className="set-block">
              <div className="set-block-head">
                <p className="set-row-title">Sauvegardes automatiques</p>
                <button type="button" className="set-link" onClick={refreshBackups} disabled={listState === 'loading'}>
                  {listState === 'loading' ? 'Lecture…' : 'Rafraîchir'}
                </button>
              </div>
              <p className="set-row-sub">
                Les dix dernières copies, de la plus récente à la plus ancienne. Une restauration sauvegarde l’état d’avant.
              </p>
              {listError && (
                <p className="set-note is-error" role="alert">
                  {listError}
                </p>
              )}
              {backupList && backupList.length > 0 ? (
                <ul className="set-backups">
                  {backupList.slice(0, 10).map((entry) => (
                    <li key={entry.name} className="set-backup">
                      <div className="set-backup-main">
                        <span className="set-backup-title">{COLLECTION_LABELS[entry.collection]}</span>
                        <span className="set-backup-meta">
                          {backupWhen(entry.savedAt)} · {fileSize(entry.bytes)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="s-btn is-sm"
                        onClick={() => void openRestore(entry)}
                        disabled={restoring}
                      >
                        <RotateCcw size={13} aria-hidden />
                        Restaurer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : listState === 'loading' ? (
                <p className="set-note">
                  Lecture du dossier <code className="set-path">.sauvegardes</code>…
                </p>
              ) : listState === 'idle' && backupList ? (
                <p className="set-note">Aucune copie automatique pour l’instant. Une copie est faite à chaque enregistrement.</p>
              ) : null}
            </div>

            {restoreReport && (
              <div className="set-status is-uptodate set-import-result" role="status" aria-live="polite">
                <p className="set-import-headline">
                  <Check size={15} aria-hidden /> Restauration terminée.
                </p>
                <p>
                  {COLLECTION_LABELS[restoreReport.collection]} : {restoreReport.facts.join(', ')}.
                </p>
                <p className="set-status-soft">
                  Avant : {countsSentence(restoreReport.before)}. Après : {countsSentence(restoreReport.after)}.
                </p>
                {restoreReport.backup ? (
                  <p className="set-status-soft">
                    Une copie de l’état d’avant a été faite : <code className="set-path">{restoreReport.backup}</code>.
                  </p>
                ) : (
                  <p className="set-status-soft">Aucune donnée n’existait avant : rien n’a été écrasé.</p>
                )}
              </div>
            )}

            <div className="set-block">
              <p className="set-row-title">Exporter</p>
              <p className="set-row-sub">Un fichier JSON lisible et daté : tout, ou les recettes seules.</p>
              <div className="set-actions">
                <button type="button" className="s-btn is-sm" onClick={exportAll}>
                  Exporter tout
                </button>
                <button type="button" className="s-btn is-sm" onClick={exportRecipes}>
                  Exporter les recettes
                </button>
              </div>
            </div>

            {exported && (
              <p className="set-note" role="status">
                Téléchargement lancé : <code className="set-path">{exported}</code>
              </p>
            )}

            <div className="set-block">
              <p className="set-row-title">Importer un fichier</p>
              <p className="set-row-sub">
                Un export complet remplace tout. Sitos montre ce qu’il contient avant d’écrire, et sauvegarde d’abord.
              </p>
              <div className="set-actions">
                <button type="button" className="s-btn is-sm" onClick={() => fileInput.current?.click()}>
                  Choisir un fichier…
                </button>
              </div>
              <input
                ref={fileInput}
                className="set-file"
                type="file"
                accept="application/json,.json"
                aria-label="Fichier à importer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void chooseFile(file);
                }}
              />
            </div>

            {refusal && (
              <div className="set-status is-error set-import-result" role="alert">
                <p className="set-import-headline">« {refusal.fileName} » est refusé.</p>
                <p>{refusal.reason}</p>
                <p className="set-status-soft">Rien n’a été écrit.</p>
              </div>
            )}

            {report && (
              <div className="set-status is-uptodate set-import-result" role="status" aria-live="polite">
                <p className="set-import-headline">
                  <Check size={15} aria-hidden /> Import terminé.
                </p>
                <p>
                  {report.kind === 'recettes'
                    ? recipesSentence(report)
                    : `Tout a été remplacé : ${countsSentence(report.counts)} repris.`}
                </p>
                {report.kind === 'recettes' ? (
                  <p className="set-status-soft">
                    {report.kept
                      ? `${plural(
                          report.kept,
                          'recette du carnet n’était pas dans le fichier et est gardée',
                          'recettes du carnet n’étaient pas dans le fichier et sont gardées',
                        )}.`
                      : 'Toutes les recettes du carnet venaient du fichier.'}
                  </p>
                ) : (
                  <p className="set-status-soft">Avant : {countsSentence(report.before)}.</p>
                )}
                <p className="set-status-soft">
                  Une sauvegarde a été faite avant l’écriture, dans <code className="set-path">.sauvegardes</code>.
                </p>
              </div>
            )}

            <div className="set-block">
              <div className="set-block-head">
                <p className="set-row-title">Journal des erreurs</p>
                {errors.length > 0 && (
                  <button
                    type="button"
                    className="set-link"
                    onClick={() => {
                      clearErrorLog();
                      setErrors([]);
                    }}
                  >
                    <Trash2 size={13} aria-hidden />
                    Vider le journal
                  </button>
                )}
              </div>
              <p className="set-row-sub">
                Les échecs d’écriture, d’import, de sauvegarde et de restauration, gardés sur ce Mac. Aucune donnée
                personnelle, 200 entrées au plus.
              </p>
              {errors.length === 0 ? (
                <p className="set-note">Aucune erreur enregistrée.</p>
              ) : (
                <ul className="set-journal">
                  {errors.map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <time dateTime={entry.at}>{errorWhen(entry.at)}</time>
                      <b>{entry.action}</b>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="set-row">
              <div className="set-row-text">
                <p className="set-row-title">Photos des recettes</p>
                <p className="set-row-sub">
                  {covers
                    ? `${covers.count} photo${covers.count > 1 ? 's' : ''} en cache (${Math.round((covers.bytes / 1024 / 1024) * 10) / 10} Mo)`
                    : 'Gardées sur ce Mac après le premier affichage.'}
                </p>
              </div>
              <button
                type="button"
                className="s-btn is-sm"
                disabled={!covers?.count}
                onClick={async () => {
                  await clearCoverCache();
                  setCovers(await coverCacheSize());
                }}
              >
                Vider
              </button>
            </div>

            {isNative && (
              <p className="set-note">
                Une copie automatique est gardée à chaque enregistrement, dans le dossier{' '}
                <code className="set-path">.sauvegardes</code>.
              </p>
            )}
          </section>
        </div>
      </div>

      <footer className="set-colophon">
        <p>
          <strong>Sitos</strong> : σῖτος, les vivres. Valeurs nutritionnelles de la table Ciqual 2020 (ANSES) ; objectifs
          selon Henry (2005), l’ANSES et l’OMS. Des repères pour un adulte en bonne santé, pas un avis médical.
        </p>
        <div className="set-colophon-links">
          <button type="button" className="set-link" onClick={() => void openLink('repo')}>
            Code source <ArrowUpRight size={14} aria-hidden />
          </button>
          <button type="button" className="set-link" onClick={() => void openLink('ciqual')}>
            Table Ciqual <ArrowUpRight size={14} aria-hidden />
          </button>
        </div>
      </footer>

      <Sheet
        open={reviewOpen && !!pending}
        onClose={closeReview}
        title="Relire le fichier"
        subtitle={pending ? pending.fileName : undefined}
        size="sm"
        dismissible={!importing}
        footer={
          <div className="set-sheet-foot">
            <SheetActions
              onCancel={closeReview}
              onConfirm={() => void confirmImport()}
              confirmLabel={pending?.preview.kind === 'recettes' ? 'Reprendre les recettes' : 'Remplacer les données'}
              busy={importing}
            />
          </div>
        }
      >
        {pending && (
          <>
            <dl className="set-import-facts">
              <div>
                <dt>Application</dt>
                <dd>{pending.preview.header.application}</dd>
              </div>
              <div>
                <dt>Version du schéma</dt>
                <dd className="num">{pending.preview.header.schemaVersion}</dd>
              </div>
              <div>
                <dt>Date de l’export</dt>
                <dd>{exportDate(pending.preview.header.exportedAt)}</dd>
              </div>
              <div>
                <dt>Contenu</dt>
                <dd>{pending.preview.kind === 'complet' ? 'Export complet' : 'Recettes seules'}</dd>
              </div>
            </dl>

            <div className={`set-import-counts ${pending.preview.kind === 'recettes' ? 'is-one' : ''}`}>
              {tiles.map(([label, value]) => (
                <div key={label}>
                  <b className="num">{value}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <p className="set-import-note">
              {pending.preview.kind === 'complet'
                ? 'Tout sera remplacé par le contenu du fichier : recettes, achats, plan de la semaine, journal et réglages. Une sauvegarde est faite avant d’écrire.'
                : 'Seules les recettes sont reprises. Celles du carnet qui ne sont pas dans le fichier sont gardées ; une fiche de même identifiant est remplacée.'}
            </p>

            {pending.preview.unknownIngredients > 0 && (
              <p className="set-import-warn">
                {plural(
                  pending.preview.unknownIngredients,
                  'ingrédient ne trouve pas son aliment dans le catalogue : il sera gardé tel quel',
                  'ingrédients ne trouvent pas leur aliment dans le catalogue : ils seront gardés tels quels',
                )}
                .
              </p>
            )}

            {importError && (
              <p className="set-import-error" role="alert">
                {importError}
              </p>
            )}
          </>
        )}
      </Sheet>

      <Sheet
        open={!!restoreTarget}
        onClose={closeRestore}
        title="Restaurer une sauvegarde"
        subtitle={restoreTarget ? backupWhen(restoreTarget.entry.savedAt) : undefined}
        size="sm"
        dismissible={!restoring}
        onSubmit={() => void confirmRestore()}
        footer={
          <div className="set-sheet-foot">
            <SheetActions
              onCancel={closeRestore}
              onConfirm={() => void confirmRestore()}
              confirmLabel="Restaurer"
              busy={restoring}
              disabled={!restoreConfirmed}
            />
          </div>
        }
      >
        {restoreTarget && (
          <>
            <dl className="set-import-facts">
              <div>
                <dt>Collection</dt>
                <dd>{COLLECTION_LABELS[restoreTarget.entry.collection]}</dd>
              </div>
              <div>
                <dt>Copie du</dt>
                <dd>{backupWhen(restoreTarget.entry.savedAt)}</dd>
              </div>
              <div>
                <dt>Taille</dt>
                <dd className="num">{fileSize(restoreTarget.entry.bytes)}</dd>
              </div>
              <div>
                <dt>Fichier</dt>
                <dd>
                  <code className="set-path">{restoreTarget.entry.name}</code>
                </dd>
              </div>
            </dl>

            <div className="set-restore-content">
              <p className="set-row-title">Ce que contient la copie</p>
              <ul className="set-restore-facts">
                {restoreTarget.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>

            <p className="set-import-note">
              La collection « {COLLECTION_LABELS[restoreTarget.entry.collection]} » sera remplacée par cette copie.
              Sitos sauvegarde l’état actuel avant d’écrire.
            </p>

            <div className="set-confirm">
              <label htmlFor="set-restore-word">Écris « restaurer » pour confirmer.</label>
              <input
                id="set-restore-word"
                type="text"
                value={restoreWord}
                onChange={(e) => setRestoreWord(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="restaurer"
              />
            </div>

            {restoreError && (
              <p className="set-import-error" role="alert">
                {restoreError}
              </p>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
