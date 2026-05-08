import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock axios so components don't make real HTTP calls
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'An error occurred',
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock react-router-dom navigate (used in many pages)
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'test-uuid-1234' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Suppress noisy console.error in tests (e.g. React act() warnings)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('act(') || args[0].includes('Warning:'))
    ) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
