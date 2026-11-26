/**
 * La jauge d’une ligne de bilan : une barre neutre, remplie à la part de la cible.
 * Elle reste dans son fichier parce que le bilan de la journée (Balance.tsx) et le
 * composeur de repas s’en servent encore ; la charte v3 a `.s-jauge` pour ses pages.
 */
export function Meter({
  value,
  target,
  tone = 'herb',
  label,
}: {
  value: number;
  target: number;
  tone?: 'herb' | 'saffron' | 'tomato' | 'ink';
  label?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <span
      className={`meter meter-${tone}`}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-label={label}
    >
      <span className="meter-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
