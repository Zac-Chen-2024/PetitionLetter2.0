import { QueryClient } from '@tanstack/react-query';

/**
 * One QueryClient for the app. Server state in this app changes only through
 * our own mutations (single user per workspace), so we do not refetch on
 * window focus and treat data as fresh until a mutation invalidates it.
 * Retries are off: the API layer already retries at the LLM level, and a
 * failed read should surface immediately.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
