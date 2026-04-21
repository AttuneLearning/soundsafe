import { createContext, useContext, type ReactNode } from 'react';
import type { Platform } from './index';

/**
 * React context carrying the active Platform. Provided once at the app
 * root via `<PlatformProvider platform={createPlatform()}>`. Hooks in
 * `consumer-app` (and `audio-graph-ts` later) read it via `usePlatform()`.
 */
export const PlatformContext = createContext<Platform | null>(null);

export interface PlatformProviderProps {
  platform: Platform;
  children: ReactNode;
}

export function PlatformProvider({
  platform,
  children,
}: PlatformProviderProps): JSX.Element {
  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}

/**
 * Throws if called outside a `<PlatformProvider>`. Components that depend
 * on the platform should not render before the provider is mounted.
 */
export function usePlatform(): Platform {
  const ctx = useContext(PlatformContext);
  if (ctx === null) {
    throw new Error(
      'usePlatform() called outside <PlatformProvider>. Wrap your app root.',
    );
  }
  return ctx;
}
