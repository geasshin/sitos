import { useCallback, useEffect, useRef } from 'react';
import './welcome.css';

/**
 * La fenêtre de bienvenue, montrée une seule fois : ce que Sitos garde, d’où
 * viennent les repères, où vivent les fichiers, par quoi commencer.
 * Une seule sortie, au clic comme au clavier : Entrée, ⌘Entrée ou Échap.
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  const finish = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onStart();
  }, [onStart]);

  // Le focus part sur le bouton, et le clavier ne peut pas rester coincé ici.
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [finish]);

  return (
    <main className="wlc">
      <div className="wlc-sheet">
        <header className="wlc-head">
          <p className="wlc-brand">sitos</p>
          <h1 className="wlc-title">Bienvenue</h1>
        </header>

        <div className="wlc-blocks">
          <section className="wlc-block">
            <h2>Une semaine de repas</h2>
            <p>
              Sitos tient la semaine, du lundi au dimanche : les repas prévus, le stock des courses, les recettes de la
              bibliothèque et le bilan de chaque journée. Tu y poses ce que tu vas cuisiner, l’app déduit le stock qui
              reste et montre ce qu’une journée apporte. Tout reste sur cet ordinateur : aucun compte, aucune
              synchronisation.
            </p>
          </section>

          <section className="wlc-block">
            <h2>D’où viennent les repères</h2>
            <p>
              Les repères de la journée ne sont pas inventés ici. L’énergie se calcule à partir du métabolisme de base
              de Henry (2005) et de ton activité ; les protéines, les fibres, les légumes et fruits, les graisses
              saturées, les sucres et le sel suivent l’ANSES et l’OMS. Le questionnaire Mes objectifs, dans Paramètres,
              les adapte à ta situation. Bilan montre où tu en es pour la journée.
            </p>
          </section>

          <section className="wlc-block">
            <h2>Où vivent tes données</h2>
            <p>
              Le plan, le stock, les recettes et le journal sont des fichiers json dans le dossier de l’application, sur
              ce Mac. Sitos en garde des copies automatiques et une sauvegarde manuelle. Depuis Paramètres, tu peux tout
              exporter dans un fichier, le réimporter sur une autre machine et ouvrir le dossier dans le Finder.
            </p>
          </section>

          <section className="wlc-block">
            <h2>Par où commencer</h2>
            <p>
              « Proposer une semaine » remplit les jours libres à partir du stock et des recettes, et chaque ligne reste
              modifiable avant d’être gardée. Pour un jour précis, ouvre-le dans Ma semaine et choisis « Composer le
              repas » : tu y choisis une recette ou un plat maison, les ingrédients et les portions. Rien n’est
              définitif : un repas se déplace, s’échange ou se retire.
            </p>
          </section>
        </div>

        <footer className="wlc-foot">
          <button ref={button} type="button" className="wlc-start" onClick={finish}>
            Commencer
          </button>
          <p className="wlc-hint">Entrée ou Échap pour commencer.</p>
        </footer>
      </div>
    </main>
  );
}
