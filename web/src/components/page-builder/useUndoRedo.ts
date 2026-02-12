import { useState, useCallback, useRef } from 'react';

interface UndoRedoResult<T> {
  state: T;
  set: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initial: T, maxHistory = 50): UndoRedoResult<T> {
  const [present, setPresent] = useState(initial);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  const set = useCallback((newState: T) => {
    // Skip if identical (deep equality via JSON)
    const currentJson = JSON.stringify(present);
    const newJson = JSON.stringify(newState);
    if (currentJson === newJson) return;

    pastRef.current = [...pastRef.current, present].slice(-maxHistory);
    futureRef.current = [];
    setPresent(newState);
  }, [present, maxHistory]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [present, ...futureRef.current];
    setPresent(previous);
  }, [present]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, present];
    setPresent(next);
  }, [present]);

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
