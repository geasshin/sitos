import type { ReactNode } from 'react';
import { LockKeyhole, Soup } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatShort } from '../domain/dates';
import { entriesOn, mealOf } from '../domain/nutrition';
import { MiniPanel, PanelLink } from './ui';

function Locked({ children }: { children: ReactNode }) {
  return (
    <div className="locked-feature">
      <span className="locked-icon" aria-hidden>
        <LockKeyhole size={20} />
      </span>
      <p className="hint">{children}</p>
    </div>
  );
}

/** La journée de demain, sans jamais inventer de repas. */
export function TomorrowPanel() {
  const app = useApp();
  const { data, today } = app;
  const date = addDays(today, 1);
  const entries = entriesOn(data, date);
  const names = entries.map((entry) => {
    if (entry.kind === 'out') return 'Repas dehors';
    return mealOf(data, entry)?.name ?? 'Repas à préciser';
  });

  return (
    <MiniPanel title="Demain" aside={<PanelLink onClick={() => app.goTo('calendar', date)}>Semaine</PanelLink>}>
      {names.length === 0 ? (
        <p className="hint">Rien de prévu pour {formatShort(date)}.</p>
      ) : (
        <div className="tomorrow-feature">
          <span className="tomorrow-icon" aria-hidden>
            <Soup size={34} strokeWidth={1.5} />
          </span>
          <p className="tomorrow-name">{names[0]}</p>
          {names.length > 1 && (
            <p className="muted small num">
              + {names.length - 1} autre{names.length > 2 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </MiniPanel>
  );
}

/** Deux modules verrouillés, strictement identiques dans leur composition. */
export function WeightPanel() {
  return (
    <MiniPanel
      title="Poids"
      aside={
        <span className="locked-badge">
          <LockKeyhole size={12} aria-hidden /> Bientôt
        </span>
      }
    >
      <Locked>
        <>
          Connexion aux applis de suivi et aux balances connectées.
          <br />
          Saisie manuelle aussi.
        </>
      </Locked>
    </MiniPanel>
  );
}

/** Dépense énergétique : module verrouillé, en attente d'une source fiable. */
export function ExpensePanel() {
  return (
    <MiniPanel
      title="Dépense énergétique"
      aside={
        <span className="locked-badge">
          <LockKeyhole size={12} aria-hidden /> Bientôt
        </span>
      }
    >
      <Locked>
        <>
          Pas, sport et calories : connexion aux applis de santé.
          <br />
          Saisie manuelle aussi.
        </>
      </Locked>
    </MiniPanel>
  );
}
