import { useCallback, useEffect, useRef, useState } from 'react';
import type { Data } from './domain/types';
import { todayISO } from './domain/dates';
import { KEYS, loadData, saveCollection, type Key } from './storage';

export type SaveState = 'chargement' | 'enregistré' | 'enregistrement' | 'erreur';
const HISTORY = 40;

export interface Store {
  data: Data | null;
  error: string | null;
  saveState: SaveState;
  update: <K extends Key>(key: K, fn: (value: Data[K]) => Data[K]) => void;
  undo: () => void;
  canUndo: boolean;
}

export function useStore(): Store {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('chargement');
  const history = useRef<Data[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const latest = useRef<Data | null>(null);
  const pending = useRef(new Set<Key>());
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadData(todayISO())
      .then(({ data: d, missing }) => {
        latest.current = d;
        setData(d);
        setSaveState('enregistré');
        // Premier lancement : on écrit tout de suite les collections de départ.
        if (missing.length) schedule(missing);
      })
      .catch((e: unknown) => {
        setError(`Impossible de lire les données : ${e instanceof Error ? e.message : String(e)}`);
        setSaveState('erreur');
      });
  }, []);

  const flush = useCallback(async () => {
    const keys = [...pending.current];
    pending.current.clear();
    if (!latest.current || keys.length === 0) return;
    setSaveState('enregistrement');
    try {
      for (const key of keys) await saveCollection(key, latest.current[key]);
      setSaveState(pending.current.size ? 'enregistrement' : 'enregistré');
    } catch {
      keys.forEach((k) => pending.current.add(k));
      setSaveState('erreur');
    }
  }, []);

  const schedule = useCallback(
    (keys: Key[]) => {
      keys.forEach((k) => pending.current.add(k));
      setSaveState('enregistrement');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 300);
    },
    [flush],
  );

  const update = useCallback(
    <K extends Key>(key: K, fn: (value: Data[K]) => Data[K]) => {
      const prev = latest.current;
      if (!prev) return;
      const next = { ...prev, [key]: fn(prev[key]) };
      latest.current = next;
      setData(next);
      history.current = [...history.current.slice(-HISTORY + 1), prev];
      setHistoryLength(history.current.length);
      schedule([key]);
    },
    [schedule],
  );

  const undo = useCallback(() => {
    const prev = history.current[history.current.length - 1];
    if (!prev || !latest.current) return;
    const current = latest.current;
    history.current = history.current.slice(0, -1);
    setHistoryLength(history.current.length);
    latest.current = prev;
    setData(prev);
    schedule(KEYS.filter((k) => prev[k] !== current[k]));
  }, [schedule]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [undo]);

  return { data, error, saveState, update, undo, canUndo: historyLength > 0 };
}
