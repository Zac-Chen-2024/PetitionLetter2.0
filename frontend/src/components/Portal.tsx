import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renders children into document.body via React Portal.
 * Use this to escape parent stacking contexts (z-index containment)
 * so that modals/overlays always appear above all other content.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
