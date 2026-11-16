import { useEffect, useState } from 'react';
import { Archive, Check, ExternalLink, FolderOpen, Loader2, RefreshCw, Target } from 'lucide-react';
import { useApp } from '../context';
import { Section } from '../components/ui';
import { applyTheme, createBackup, getBackupInfo, getDataFolder, isNative, openDataFolder, openLink, type BackupInfo } from '../storage';
import { appVersion, checkForUpdate, installUpdate, useUpdates } from '../updates';
import { clearCoverCache, coverCacheSize } from '../imageCache';

const THEMES = [
  ['system', 'Comme le Mac'],
  ['light', 'Clair'],
  ['dark', 'Sombre'],
] as const;

const backupDate = (name: string) => {
  const m = /manuel-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  return m ? `${m[3]}/${m[2]}/${m[1]} à ${m[4]} h ${m[5]}` : name;
};

export function SettingsView() {
  const app = useApp();
  const { data, store, targets } = app;
  const s = data.settings;
  const u = useUpdates();
  const [version, setVersion] = useState<string>();
  const [folder, setFolder] = useState<string>();
  const [backups, setBackups] = useState<BackupInfo>();
  const [backupState, setBackupState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [covers, setCovers] = useState<{ count: number; bytes: number }>();
  useEffect(() => void coverCacheSize().then(setCovers), []);

  const refreshBackups = () => void getBackupInfo().then(setBackups);
  useEffect(() => {
    void appVersion().then(setVersion);
    void getDataFolder().then(setFolder);
    refreshBackups();
  }, []);

  const setSettings = (patch: Partial<typeof s>) => store.update('settings', (x) => ({ ...x, ...patch }));
  const auto = s.autoUpdate !== false;
  const meals = s.mealsPerDay ?? 1;
  const theme = s.theme ?? 'system';
  const checking = u.phase === 'checking';

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="display-title">Paramètres</h1>
      </header>

      <Section title="Mises à jour">
        {!isNative ? (
          <p className="hint">Version de développement dans le navigateur : les mises à jour ne concernent que l’application installée.</p>
        ) : (
          <>
            <div className="setting-row">
              <div>
                <p className="setting-label">Version installée</p>
                <p className="setting-value num">Sitos {version ?? '…'}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => void checkForUpdate(true)} disabled={checking || u.phase === 'installing'}>
                {checking ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
                {checking ? 'Recherche…' : 'Rechercher une mise à jour'}
              </button>
            </div>

            <div className={`update-status is-${u.phase}`} role="status" aria-live="polite">
              {u.phase === 'idle' && <p className="muted">Pas encore vérifié depuis l’ouverture.</p>}
              {u.phase === 'checking' && <p className="muted">Recherche en cours…</p>}
              {u.phase === 'uptodate' && (
                <p>
                  <Check size={15} aria-hidden /> Sitos est à jour.
                  {u.checkedAt && <span className="muted"> Vérifié à {u.checkedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</span>}
                </p>
              )}
              {u.phase === 'error' && <p className="danger">{u.error}</p>}
              {(u.phase === 'available' || u.phase === 'installing') && u.available && (
                <div className="update-available">
                  <p>
                    <strong>Sitos {u.available.version}</strong> est disponible.
                  </p>
                  {u.available.notes && <pre className="release-notes">{u.available.notes}</pre>}
                  {u.error && <p className="danger">{u.error}</p>}
                  <button type="button" className="primary-button" onClick={() => void installUpdate()} disabled={u.phase === 'installing'}>
                    {u.phase === 'installing' ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
                    {u.phase === 'installing' ? 'Installation… Sitos va redémarrer' : 'Installer et redémarrer'}
                  </button>
                  <p className="hint">Le paquet est vérifié (signature) avant d’être installé. Tes données ne bougent pas.</p>
                </div>
              )}
            </div>

            <label className="toggle-row">
              <input type="checkbox" checked={auto} onChange={(e) => setSettings({ autoUpdate: e.target.checked })} />
              <span>
                <span className="setting-label">Rechercher automatiquement</span>
                <span className="hint">À l’ouverture puis toutes les six heures. Rien ne s’installe sans ton accord.</span>
              </span>
            </label>

            <button type="button" className="link small" onClick={() => void openLink('releases')}>
              Toutes les versions et leurs notes <ExternalLink size={13} aria-hidden />
            </button>
          </>
        )}
      </Section>

      <Section title="Nutrition">
        <div className="setting-row">
          <div>
            <p className="setting-label">Repas principaux par jour</p>
            <p className="hint">
              {meals === 1
                ? 'Un seul repas principal ; les compléments complètent la journée.'
                : `Les objectifs se partagent entre les ${meals} repas. Aujourd’hui affiche ${meals} cartes ; le calendrier accepte plusieurs repas le même jour.`}
            </p>
          </div>
          <div className="seg-group" role="radiogroup" aria-label="Repas principaux par jour">
            {([1, 2, 3] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={meals === k}
                className={`seg-pill ${meals === k ? 'on' : ''}`}
                onClick={() => {
                  setSettings({ mealsPerDay: k, mealShare: k === 1 ? 0.75 : k === 2 ? 0.45 : 0.35 });
                  if (s.profile) setSettings({ profile: { ...s.profile, rhythm: k === 1 ? 'un-repas' : k === 2 ? 'deux-repas' : 'trois-repas' } });
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-label">Repas par cuisson</p>
            <p className="hint">Ce qu'une recette donne quand sa fiche ne le précise pas. Deux ou trois repas, c'est le rythme du batch cooking.</p>
          </div>
          <div className="seg-group" role="radiogroup" aria-label="Repas par cuisson">
            {([2, 3, 4] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={(s.mealsPerCook ?? 2) === k}
                className={`seg-pill ${(s.mealsPerCook ?? 2) === k ? 'on' : ''}`}
                onClick={() => setSettings({ mealsPerCook: k })}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-label">Mes objectifs</p>
            <p className="setting-value">
              {Math.round(targets.kcal).toLocaleString('fr-FR')} kcal, {targets.protein} g de protéines par jour
              {!s.profile && <span className="muted"> (provisoires)</span>}
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={() => app.goTo('nutrition')}>
            <Target size={15} aria-hidden /> {s.profile ? 'Revoir' : 'Définir'}
          </button>
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-label">Liste de courses</p>
            <p className="hint">Ce qui manque pour le plan, ce qui va finir et les produits de base, avec le nombre de fruits par jour.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => app.goTo('stock')}>
            <Archive size={15} aria-hidden /> Ouvrir le stock
          </button>
        </div>
      </Section>

      <Section title="Apparence">
        <div className="seg-group" role="radiogroup" aria-label="Apparence">
          {THEMES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              className={`seg-pill ${theme === id ? 'on' : ''}`}
              onClick={() => {
                setSettings({ theme: id });
                void applyTheme(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Données">
        {isNative ? (
          <>
            <p className="hint">
              Tout reste sur ce Mac, en fichiers JSON lisibles. Avant chaque modification, la version précédente est copiée
              {backups ? ` (${backups.automatic} copies automatiques gardées)` : ''}.
            </p>
            {folder && <code className="path">{folder.replace(/^\/Users\/[^/]+/, '~')}</code>}
            <div className="setting-actions">
              <button type="button" className="secondary-button" onClick={() => void openDataFolder()}>
                <FolderOpen size={15} aria-hidden /> Ouvrir le dossier
              </button>
              <button
                type="button"
                className="secondary-button"
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
                <Archive size={15} aria-hidden /> Faire une sauvegarde maintenant
              </button>
            </div>
            {backupState === 'done' && <p className="small"><Check size={14} aria-hidden /> Sauvegarde faite.</p>}
            {backupState === 'error' && <p className="small danger">La sauvegarde a échoué.</p>}
            {backups && backups.manual.length > 0 && (
              <p className="hint">
                Dernière sauvegarde manuelle : {backupDate(backups.manual[0])}
                {backups.manual.length > 1 ? ` (${backups.manual.length} en tout)` : ''}.
              </p>
            )}
          </>
        ) : (
          <p className="hint">Dans le navigateur, les données sont dans le dossier data/ du dépôt.</p>
        )}
        <div className="setting-row">
          <div>
            <p className="setting-label">Photos des recettes</p>
            <p className="hint">
              {covers
                ? `${covers.count} photo${covers.count > 1 ? 's' : ''} en cache (${Math.round(covers.bytes / 1024 / 1024 * 10) / 10} Mo). Elles s'affichent sans réseau.`
                : 'Gardées sur ce Mac après le premier affichage, pour ne pas les retélécharger.'}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={!covers?.count}
            onClick={async () => {
              await clearCoverCache();
              setCovers(await coverCacheSize());
            }}
          >
            Vider le cache
          </button>
        </div>
      </Section>

      <Section title="À propos">
        <p>
          <strong>Sitos</strong> : σῖτος, les vivres. Le stock des courses, un plat par jour, tes recettes et ta nutrition, sur ton Mac.
        </p>
        <p className="hint">
          Valeurs nutritionnelles : table Ciqual 2020 de l’ANSES. Objectifs : équations de Henry (2005), repères de l’ANSES et de l’OMS.
          Ce sont des repères pour un adulte en bonne santé, pas un avis médical.
        </p>
        <div className="setting-actions">
          <button type="button" className="link small" onClick={() => void openLink('repo')}>
            Code source <ExternalLink size={13} aria-hidden />
          </button>
          <button type="button" className="link small" onClick={() => void openLink('ciqual')}>
            Table Ciqual <ExternalLink size={13} aria-hidden />
          </button>
        </div>
      </Section>
    </div>
  );
}
