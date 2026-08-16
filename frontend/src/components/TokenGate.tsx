/**
 * TokenGate - minimal workspace-token prompt.
 *
 * Renders children normally. When any API call returns 401 (see services/api.ts)
 * an overlay asks for a token; on submit the token is stored and the page
 * reloads so every context re-fetches under the new workspace.
 */
import { useEffect, useState } from 'react';
import { getToken, setToken, UNAUTHORIZED_EVENT } from '../services/auth';

export function TokenGate({ children }: { children: React.ReactNode }) {
  const [needsToken, setNeedsToken] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onUnauthorized = () => setNeedsToken(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setToken(t);
    window.location.reload();
  };

  return (
    <>
      {children}
      {needsToken && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <form
            onSubmit={submit}
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div>
              <h2 className="text-base font-semibold text-slate-800">Workspace token required</h2>
              <p className="mt-1 text-sm text-slate-500">
                {getToken()
                  ? 'The stored token was rejected by the server. Paste a valid one.'
                  : 'Paste the token you were given to open your workspace.'}
              </p>
            </div>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="token"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default TokenGate;
