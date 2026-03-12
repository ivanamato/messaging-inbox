/**
 * Test doubles for unit testing.
 * Re-exports all mock implementations for convenient imports.
 */

export {
  MockChatRepository,
  MockMessageRepository,
  MockMediaRepository,
  MockConnectionRepository,
  createMockRepositories,
  type MockRepositorySet,
} from './repository-doubles';

export {
  TestProvider,
  useTestContext,
  useMockRepositories,
  useMockChatRepository,
  useMockMessageRepository,
  defaultMockDevice,
  type TestContextValue,
  type TestProviderProps,
} from './test-context';
