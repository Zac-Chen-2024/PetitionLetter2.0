import type { ReactNode } from 'react';
import { ProjectProvider } from './ProjectContext';
import { SnippetsProvider } from './SnippetsContext';
import { ArgumentsProvider } from './ArgumentsContext';
import { UIProvider } from './UIContext';
import { WritingProvider } from './WritingContext';

// ============================================
// ContextProviders (M11)
//
// Nests the context providers. Project data is no longer loaded by a hand-written
// DataLoader: each provider hydrates from its TanStack Query (project /
// standards / snippets / arguments / sections keyed by projectId), so switching
// projects simply re-keys the queries.
// ============================================

/**
 * AppProviders: Nests all context providers in the correct order.
 * ProjectProvider is outermost (no dependencies).
 * SnippetsProvider and ArgumentsProvider read projectId from it.
 * UIProvider and WritingProvider are innermost.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ProjectProvider>
      <SnippetsProvider>
        <ArgumentsProvider>
          <UIProvider>
            <WritingProvider>
              {children}
            </WritingProvider>
          </UIProvider>
        </ArgumentsProvider>
      </SnippetsProvider>
    </ProjectProvider>
  );
}
