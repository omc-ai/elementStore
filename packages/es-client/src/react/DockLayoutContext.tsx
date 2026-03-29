/**
 * DockLayoutContext — Coordinates docked panel positioning.
 *
 * Top/bottom docked panels report their rendered height.
 * Left/right docked panels read these offsets to position below top and above bottom.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface DockOffsets {
  top: number;
  bottom: number;
}

interface DockLayoutContextValue {
  offsets: DockOffsets;
  setTopHeight: (h: number) => void;
  setBottomHeight: (h: number) => void;
}

const DockLayoutContext = createContext<DockLayoutContextValue>({
  offsets: { top: 0, bottom: 0 },
  setTopHeight: () => {},
  setBottomHeight: () => {},
});

export function DockLayoutProvider({ children }: { children: ReactNode }) {
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const setTop = useCallback((h: number) => setTopHeight(h), []);
  const setBottom = useCallback((h: number) => setBottomHeight(h), []);

  const value = useMemo<DockLayoutContextValue>(() => ({
    offsets: { top: topHeight, bottom: bottomHeight },
    setTopHeight: setTop,
    setBottomHeight: setBottom,
  }), [topHeight, bottomHeight, setTop, setBottom]);

  return (
    <DockLayoutContext.Provider value={value}>
      {children}
    </DockLayoutContext.Provider>
  );
}

export function useDockOffsets(): DockOffsets {
  return useContext(DockLayoutContext).offsets;
}

export function useDockLayoutReporter() {
  const ctx = useContext(DockLayoutContext);
  return { setTopHeight: ctx.setTopHeight, setBottomHeight: ctx.setBottomHeight };
}
