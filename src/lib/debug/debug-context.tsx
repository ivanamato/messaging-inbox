import { createContext, useContext, type PropsWithChildren } from 'react';
import type { DebugStore } from './debug-store';

const DebugStoreContext = createContext<DebugStore | null>(null);

export function DebugProvider({ store, children }: PropsWithChildren<{ store: DebugStore | null }>) {
  return (
    <DebugStoreContext.Provider value={store}>
      {children}
    </DebugStoreContext.Provider>
  );
}

export function useDebugStore(): DebugStore | null {
  return useContext(DebugStoreContext);
}
