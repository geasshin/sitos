import { useApp } from '../context';
import { Complements } from './Complements';
import { DayScore } from './DayScore';

/**
 * La journée en un seul module : la note en haut, les compléments juste dessous.
 * Le verdict dit ce qui manque ; les lignes de compléments sont le geste qui règle le manque.
 */
export function DayPanel() {
  const { today } = useApp();
  return (
    <section className="panel day-module" aria-label="Note du jour et compléments">
      <DayScore />
      <Complements date={today} />
    </section>
  );
}
