import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { useApp } from '../context';
import { ACTIVITY_LABEL, applyTargets, computeTargets, GOAL_LABEL, RHYTHM_LABEL, type Targets } from '../domain/targets';
import type { Activity, Diet, Goal, Profile, Rhythm, Sex } from '../domain/types';
import './goals.css';

const DIET_LABEL: Record<Diet, string> = {
  vegetarien: 'Végétarien',
  flexitarien: 'Peu de viande',
  omnivore: 'De tout',
};
const SEX_LABEL: Record<Sex, string> = { homme: 'Homme', femme: 'Femme' };
const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');

const STEPS = ['Toi', 'Ton quotidien', 'Ce que tu vises', 'Tes repères'] as const;
const STEP_HINT = [
  'Ton sexe, ton âge, ta taille et ton poids.',
  'Ce que tu fais de tes journées, et comment tu manges.',
  'Ce que tu vises, et ce que tu manges.',
  'Calculés à partir de tes réponses. Tout se retouche.',
] as const;

/** Résumé des objectifs en vigueur ; le questionnaire s’ouvre dans la feuille de la charte. */
export function GoalsCard() {
  const app = useApp();
  const { data, targets } = app;
  const [editing, setEditing] = useState(false);
  const p = data.settings.profile;

  const items: [string, string][] = [
    ['Énergie', `${fr(targets.kcal)} kcal`],
    ['Protéines', `${fr(targets.protein)} g`],
    ['Fibres', `${fr(targets.fiber)} g`],
    ['Légumes & fruits', `${fr(targets.plantG)} g`],
    ['Graisses saturées', `max. ${fr(targets.satFatMaxG)} g`],
    ['Sucres', `max. ${fr(targets.sugarsMaxG)} g`],
    ['Sel', `max. ${fr(targets.saltMaxG)} g`],
    ['Repas principal', `≈ ${fr(Math.round((targets.kcal * targets.mealShare) / 25) * 25)} kcal`],
  ];
  const meta = p
    ? `${SEX_LABEL[p.sex]}, ${p.age} ans, ${p.heightCm} cm, ${String(p.weightKg).replace('.', ',')} kg · ${GOAL_LABEL[p.goal].split(' (')[0].toLowerCase()}`
    : 'Provisoires. Quatre questions suffisent pour les caler sur toi.';

  return (
    <>
      <div className="goals">
        <div className="goals-head">
          <div className="goals-heading">
            <h3 className="goals-title">Mes objectifs</h3>
            <p className="goals-meta">{meta}</p>
          </div>
          <button type="button" className={p ? 's-btn is-sm' : 's-btn is-primary is-sm'} onClick={() => setEditing(true)}>
            {p ? 'Revoir' : 'Commencer'}
          </button>
        </div>
        <dl className="goals-grid">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {editing && <GoalsWizard onDone={() => setEditing(false)} />}
    </>
  );
}

function Choice<T extends string>({
  value,
  options,
  labels,
  onChange,
  name,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className="goals-choices" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`goals-choice ${value === o ? 'is-on' : ''}`}
          onClick={() => onChange(o)}
        >
          <span className="goals-choice-dot" aria-hidden>
            {value === o && <Check size={12} />}
          </span>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  unit,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value).replace('.', ','));
  return (
    <label className="field">
      <span>{label}</span>
      <span className="goals-unit">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(v) && v >= min && v <= max) onChange(Math.round(v / step) * step);
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
}

/** Le questionnaire, monté à l’ouverture seulement : il repart de zéro à chaque visite. */
function GoalsWizard({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const { data, today, store } = app;
  const lastWeight = [...data.journal.weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.kg;
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(
    data.settings.profile ?? {
      sex: 'homme',
      age: 27,
      heightCm: 188,
      weightKg: lastWeight ?? 80,
      activity: 'faible',
      goal: 'doucement',
      diet: 'flexitarien',
      rhythm: 'un-repas',
      updatedAt: today,
    },
  );
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const plan = useMemo(() => computeTargets(p), [p]);
  const [edits, setEdits] = useState<Partial<Targets>>({});
  const final: Targets = { ...plan.targets, ...Object.fromEntries(Object.entries(edits).filter(([, v]) => v !== undefined)) };

  const save = () => {
    store.update('settings', (s) => applyTargets(s, { ...p, updatedAt: today }, final));
    onDone();
  };

  return (
    <Sheet
      open
      onClose={onDone}
      title="Mes objectifs"
      subtitle={STEP_HINT[step]}
      size="lg"
      onSubmit={step === STEPS.length - 1 ? save : undefined}
      footer={
        <>
          <span className="sheet-hint">
            Étape <span className="num">{step + 1}</span> sur {STEPS.length}
          </span>
          <span className="sheet-foot-gap" />
          <button type="button" className="s-btn is-ghost" onClick={() => (step === 0 ? onDone() : setStep(step - 1))}>
            {step === 0 ? (
              'Annuler'
            ) : (
              <>
                <ArrowLeft size={15} aria-hidden /> Retour
              </>
            )}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="s-btn is-primary" onClick={() => setStep(step + 1)}>
              Continuer <ArrowRight size={15} aria-hidden />
            </button>
          ) : (
            <button type="button" className="s-btn is-primary" onClick={save}>
              <Check size={15} aria-hidden /> Enregistrer mes objectifs
            </button>
          )}
        </>
      }
    >
      <div className="goals-wizard">
        <ol className="goals-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={`s-chip ${i === step ? 'is-ink' : i < step ? 'is-mint' : ''}`} aria-current={i === step ? 'step' : undefined}>
              <span className="num">{i + 1}</span> {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="goals-step">
            <Choice name="Sexe" value={p.sex} options={['homme', 'femme']} labels={SEX_LABEL} onChange={(v) => set('sex', v)} />
            <div className="goals-fields">
              <NumberField label="Âge" value={p.age} unit="ans" min={18} max={100} onChange={(v) => set('age', v)} />
              <NumberField label="Taille" value={p.heightCm} unit="cm" min={130} max={230} onChange={(v) => set('heightCm', v)} />
              <NumberField label="Poids" value={p.weightKg} unit="kg" min={35} max={250} step={0.1} onChange={(v) => set('weightKg', v)} />
            </div>
            {lastWeight === undefined && (
              <p className="goals-hint">Pas encore de pesée : mets ton poids habituel, tu pourras le corriger plus tard.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="goals-step">
            <p className="goals-q">Ton activité, en dehors des repas</p>
            <Choice<Activity>
              name="Activité"
              value={p.activity}
              options={['faible', 'moderee', 'elevee']}
              labels={ACTIVITY_LABEL}
              onChange={(v) => set('activity', v)}
            />
            <p className="goals-q">Ton rythme de repas</p>
            <Choice<Rhythm>
              name="Rythme"
              value={p.rhythm}
              options={['un-repas', 'deux-repas', 'trois-repas']}
              labels={RHYTHM_LABEL}
              onChange={(v) => set('rhythm', v)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="goals-step">
            <p className="goals-q">Ce que tu vises</p>
            <Choice<Goal> name="Objectif" value={p.goal} options={['maintenir', 'doucement', 'perdre']} labels={GOAL_LABEL} onChange={(v) => set('goal', v)} />
            <p className="goals-q">Ta façon de manger</p>
            <Choice<Diet>
              name="Alimentation"
              value={p.diet}
              options={['vegetarien', 'flexitarien', 'omnivore']}
              labels={DIET_LABEL}
              onChange={(v) => set('diet', v)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="goals-step">
            <p className="goals-hint">
              Calculés à partir de tes réponses. Tu peux retoucher chaque valeur ; les explications disent d’où elles viennent.
            </p>
            <div className="goals-targets">
              {(
                [
                  ['kcal', 'Énergie', 'kcal', 0],
                  ['protein', 'Protéines', 'g', 1],
                  ['fiber', 'Fibres', 'g', 2],
                  ['plantG', 'Légumes & fruits', 'g', 3],
                  ['satFatMaxG', 'Graisses saturées (max.)', 'g', 4],
                  ['sugarsMaxG', 'Sucres (max.)', 'g', 5],
                  ['saltMaxG', 'Sel (max.)', 'g', 6],
                ] as [keyof Targets, string, string, number][]
              ).map(([k, label, unit, noteIdx]) => (
                <div className="goals-target" key={k}>
                  {k === 'satFatMaxG' && <p className="goals-cap">Plafonds</p>}
                  <NumberField
                    key={`${k}-${plan.targets[k]}-${edits[k] === undefined ? 'calc' : 'edit'}`}
                    label={label}
                    value={final[k] as number}
                    unit={unit}
                    min={0}
                    max={10000}
                    onChange={(v) => setEdits((e) => ({ ...e, [k]: v }))}
                  />
                  <p className="goals-note">
                    {plan.notes[noteIdx]?.text}
                    {final[k] !== plan.targets[k] && (
                      <button type="button" className="goals-reset" onClick={() => setEdits((e) => ({ ...e, [k]: undefined }))}>
                        {' '}
                        Revenir à {String(plan.targets[k]).replace('.', ',')}
                      </button>
                    )}
                  </p>
                </div>
              ))}
            </div>
            {plan.notes.slice(7).map((n) => (
              <p key={n.label} className="goals-hint">
                <strong>{n.label}.</strong> {n.text}
              </p>
            ))}
            <p className="goals-hint">
              Repas principal visé ≈ {fr(Math.round((final.kcal * final.mealShare) / 25) * 25)} kcal ({Math.round(final.mealShare * 100)} % de la
              journée), le reste pour les compléments et les fruits.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
