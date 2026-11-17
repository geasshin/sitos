import { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../context';
import { PageHeader, Panel, PanelLink } from '../components/ui';
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
      <PageHeader title="Paramètres" context={version ? `Sitos ${version}` : undefined} />

      <div className="settings-columns">
        <div className="settings-column">
          <Panel title="Repas et nutrition">
            <div className="setting-list">
              <div className="setting-row">
                <div>
                  <p className="setting-label">Repas principaux par jour</p>
                  <p className="hint">{meals === 1 ? 'Les compléments complètent la journée.' : `Les objectifs se partagent entre les ${meals} repas.`}</p>
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
                  <p className="hint">Quand la fiche ne le précise pas.</p>
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
                  <p className="hint">
                    {Math.round(targets.kcal).toLocaleString('fr-FR')} kcal, {targets.protein} g de protéines par jour{!s.profile && ' (provisoires)'}
                  </p>
                </div>
                <button type="button" className="secondary-button is-sm" onClick={() => app.goTo('nutrition')}>
                  {s.profile ? 'Revoir' : 'Définir'}
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Apparence">
            <div className="setting-list">
              <div className="setting-row">
                <p className="setting-label">Thème</p>
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
              </div>
            </div>
          </Panel>
        </div>

        <div className="settings-column">
          <Panel title="Mises à jour">
            {!isNative ? (
              <div className="setting-list">
                <div className="setting-row">
                  <div>
                    <p className="setting-label">Version de développement</p>
                    <p className="hint">Les mises à jour ne concernent que l’application installée.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="setting-list">
                <div className="setting-row">
                  <div>
                    <p className="setting-label">Version installée</p>
                    <p className="hint num">Sitos {version ?? '…'}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button is-sm"
                    onClick={() => void checkForUpdate(true)}
                    disabled={checking || u.phase === 'installing'}
                  >
                    {checking && <Loader2 size={14} className="spin" aria-hidden />}
                    {checking ? 'Recherche…' : 'Rechercher'}
                  </button>
                </div>

                {u.phase !== 'idle' && (
                  <div className={`update-status is-${u.phase}`} role="status" aria-live="polite">
                    {u.phase === 'checking' && <p className="muted">Recherche en cours…</p>}
                    {u.phase === 'uptodate' && (
                      <p>
                        <Check size={15} aria-hidden /> Sitos est à jour.
                        {u.checkedAt && (
                          <span className="muted"> Vérifié à {u.checkedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</span>
                        )}
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
                )}

                <label className="setting-row toggle-row">
                  <span>
                    <span className="setting-label">Rechercher automatiquement</span>
                    <span className="hint">À l’ouverture puis toutes les six heures. Rien ne s’installe sans ton accord.</span>
                  </span>
                  <input type="checkbox" className="switch" checked={auto} onChange={(e) => setSettings({ autoUpdate: e.target.checked })} />
                </label>

                <div className="setting-row">
                  <PanelLink onClick={() => void openLink('releases')}>Toutes les versions et leurs notes</PanelLink>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Données">
            <div className="setting-list">
              {isNative ? (
                <>
                  <div className="setting-row">
                    <div>
                      <p className="setting-label">Fichiers sur ce Mac</p>
                      <p className="hint">
                        {folder ? <code className="path">{folder.replace(/^\/Users\/[^/]+/, '~')}</code> : 'JSON lisibles'}
                        {backups ? ` · ${backups.automatic} copies automatiques` : ''}
                      </p>
                    </div>
                    <button type="button" className="secondary-button is-sm" onClick={() => void openDataFolder()}>
                      Ouvrir
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <p className="setting-label">Sauvegarde</p>
                      <p className="hint">
                        {backupState === 'done'
                          ? 'Sauvegarde faite.'
                          : backupState === 'error'
                            ? 'La sauvegarde a échoué.'
                            : backups && backups.manual.length > 0
                              ? `Dernière : ${backupDate(backups.manual[0])}${backups.manual.length > 1 ? ` (${backups.manual.length} en tout)` : ''}`
                              : 'Aucune sauvegarde manuelle.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button is-sm"
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
                      Sauvegarder
                    </button>
                  </div>
                </>
              ) : (
                <div className="setting-row">
                  <div>
                    <p className="setting-label">Fichiers</p>
                    <p className="hint">
                      Dans le navigateur, le dossier <code>data/</code> du dépôt.
                    </p>
                  </div>
                </div>
              )}
              <div className="setting-row">
                <div>
                  <p className="setting-label">Photos des recettes</p>
                  <p className="hint">
                    {covers
                      ? `${covers.count} photo${covers.count > 1 ? 's' : ''} en cache (${Math.round((covers.bytes / 1024 / 1024) * 10) / 10} Mo)`
                      : 'Gardées sur ce Mac après le premier affichage.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button is-sm"
                  disabled={!covers?.count}
                  onClick={async () => {
                    await clearCoverCache();
                    setCovers(await coverCacheSize());
                  }}
                >
                  Vider
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="À propos">
            <p className="about">
              <strong>Sitos</strong> : σῖτος, les vivres. Valeurs nutritionnelles de la table Ciqual 2020 (ANSES) ; objectifs selon Henry (2005), l’ANSES et
              l’OMS. Des repères pour un adulte en bonne santé, pas un avis médical.
            </p>
            <div className="about-links">
              <PanelLink onClick={() => void openLink('repo')}>Code source</PanelLink>
              <PanelLink onClick={() => void openLink('ciqual')}>Table Ciqual</PanelLink>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
