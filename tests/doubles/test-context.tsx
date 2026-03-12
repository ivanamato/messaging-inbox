/**
 * Test context provider for React Testing Library.
 * Provides mock repositories and device context for unit tests.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { RepositorySet } from '@/domain/repositories/types';
import { createMockRepositories, type MockRepositorySet } from './repository-doubles';
import type { DeviceConfig, ViewMode } from '@/lib/providers/types';

/**
 * Test context value with mock repositories and device state.
 */
export type TestContextValue = {
  repositories: MockRepositorySet;
  devices: DeviceConfig[];
  selectedDeviceId: string | null;
  viewMode: ViewMode;
  setSelectedDeviceId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
};

const TestContext = createContext<TestContextValue | null>(null);

/**
 * Default mock device for testing.
 */
export const defaultMockDevice: DeviceConfig = {
  id: 'test-device-1',
  label: 'Test Device',
  apiUrl: 'http://localhost:3002',
  instanceToken: 'test-token',
  instanceName: 'TEST1',
  providerType: 'evolution',
  capabilities: {
    templates: true,
    messagingWindow24h: true,
    pushToTalk: true,
    interactiveButtons: true,
    deleteForEveryone: true,
    markAsRead: true,
  },
};

/**
 * Props for TestProvider component.
 */
export type TestProviderProps = {
  children: ReactNode;
  repositories?: MockRepositorySet;
  devices?: DeviceConfig[];
  defaultDeviceId?: string;
  viewMode?: ViewMode;
};

/**
 * Test provider that wraps components with mock context.
 * Use this in unit tests instead of the real ProviderProvider.
 *
 * @example
 * ```tsx
 * import { render } from '@testing-library/preact';
 * import { TestProvider } from '../test-context';
 *
 * test('my component', () => {
 *   const { getByText } = render(
 *     <TestProvider>
 *       <MyComponent />
 *     </TestProvider>
 *   );
 * });
 * ```
 */
export function TestProvider({
  children,
  repositories,
  devices = [defaultMockDevice],
  defaultDeviceId,
  viewMode = 'single',
}: TestProviderProps) {
  const mockRepos = repositories ?? createMockRepositories();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    defaultDeviceId ?? devices[0]?.id ?? null,
  );
  const [currentViewMode, setViewMode] = useState<ViewMode>(viewMode);

  const value: TestContextValue = {
    repositories: mockRepos,
    devices,
    selectedDeviceId,
    viewMode: currentViewMode,
    setSelectedDeviceId,
    setViewMode,
  };

  return (
    <TestContext.Provider value={value}>
      {children}
    </TestContext.Provider>
  );
}

// Need to import useState
import { useState } from 'react';

/**
 * Hook to access test context.
 * Throws if used outside TestProvider.
 */
export function useTestContext(): TestContextValue {
  const ctx = useContext(TestContext);
  if (!ctx) {
    throw new Error('useTestContext must be used within TestProvider');
  }
  return ctx;
}

/**
 * Hook to access mock repositories in tests.
 */
export function useMockRepositories(): MockRepositorySet {
  return useTestContext().repositories;
}

/**
 * Hook to access mock chat repository in tests.
 */
export function useMockChatRepository(): MockRepositorySet['chat'] {
  return useTestContext().repositories.chat;
}

/**
 * Hook to access mock message repository in tests.
 */
export function useMockMessageRepository(): MockRepositorySet['message'] {
  return useTestContext().repositories.message;
}
