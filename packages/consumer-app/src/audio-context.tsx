// Consumer-app-scoped React context over the AudioEngine + PackClient
// dependency graph.
//
// For M1 we keep this minimal: a provider takes pre-built engine and
// pack-client instances (prod wires them up at app startup; tests
// pass stubs). Hooks read the engine state via
// `useAudioEngineState` from `@soundsafe/audio-graph-ts`.

import { createContext, useContext } from 'react';
import type { AudioEngine } from '@soundsafe/audio-graph-ts';
import type { PackClient } from '@soundsafe/pack-client';

export interface AppServices {
  engine: AudioEngine;
  packClient: PackClient;
}

const Ctx = createContext<AppServices | null>(null);

export function AudioServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: React.ReactNode;
}): JSX.Element {
  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useAudioServices(): AppServices {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useAudioServices must be called inside AudioServicesProvider');
  }
  return v;
}
