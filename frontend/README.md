# PetitionLetter 2.0 — frontend

React 19 + TypeScript + Vite 7 + Tailwind CSS 4. Talks to the FastAPI backend in [`../backend`](../backend);
see the [root README](../README.md) for the product, the API surface and the deployment story.

```bash
npm install
npm run dev          # http://localhost:5173, expects the backend on :8000
```

`VITE_API_BASE` overrides the backend URL (see `.env.example`); unset it and the app uses
`http://localhost:8000/api`.

## Layout

```
src/
├── api/              # the only place that talks to the server
│   ├── types.ts      # wire types — one declaration per response shape
│   ├── keys.ts       # query-key factory (hierarchical: ['arguments', id, 'coverage'])
│   ├── adapters.ts   # wire → client model (snake_case → camelCase)
│   ├── hooks.ts      # 8 queries + ~25 mutations, invalidation lives here
│   └── queryClient.ts
├── context/          # client state only; hydrated from the queries above
│   ├── ProjectContext / SnippetsContext / ArgumentsContext / WritingContext / UIContext
│   └── AppContext.tsx    # useApp() facade over all five (legacy call surface)
├── components/       # 17 components; the three panels are
│   ├── EvidenceCardPool.tsx + DocumentViewer.tsx + BBoxLightbox.tsx   # evidence + PDF
│   ├── ArgumentGraph.tsx + ArgumentCanvas/                            # writing tree
│   └── LetterPanel.tsx                                                # letter + diff review
├── services/         # api.ts (fetch + job protocol), auth.ts, interactionLogger.ts
├── utils/            # pure logic: sentenceDiff.ts, provenance.ts
├── hooks/ constants/ i18n/ types/
```

**Rule:** server state goes through `src/api/`. Components and contexts do not call `apiClient` directly.

## Things worth knowing

- **Job protocol.** Long operations (extract / generate arguments / write a section) return `202` + a job
  record. `postJob()` in `services/api.ts` submits, polls with backoff, reports progress, supports cancel via
  `AbortSignal`, and resolves with the job's `result` — so call sites look synchronous.
- **Writing Tree renderers.** The react-flow canvas (`ArgumentCanvas/FlowCanvas.tsx`) lives behind
  `?canvas=v2` (remembered in `localStorage`); `?canvas=v1` returns to the legacy hand-written canvas, which
  is still the default until the parity checklist is signed off. Both share the same shell in
  `ArgumentGraph.tsx`.
- **View modes.** `line` (default) and `sankey` — `ViewMode` in `types/index.ts`.
- **Letter editing state.** `letterSections` hydrates once per project on purpose: staleness marks, pending
  regeneration diffs and local edits must survive query invalidation. Regeneration produces a reviewable diff
  (`utils/sentenceDiff.ts`) that the user accepts or reverts; accepting `PUT`s the full section back.
- **Auth.** A bearer token per workspace, kept in `localStorage`, attached by `services/api.ts`. PDF URLs
  carry `?token=` because `<iframe>`/`<img>` cannot set headers. `TokenGate` prompts when the server answers
  401.
- **Interaction logging.** `services/interactionLogger.ts` batches a closed vocabulary of events and flushes
  every 30 s / 50 events, with `sendBeacon` on page hide.

## Checks

```bash
npx tsc -b        # must be 0 errors
npx eslint .      # 0 errors (warnings are tracked, mostly in ArgumentGraph.tsx)
npm run build
```

There is no frontend test suite yet; the pure logic in `utils/` and the job protocol in `services/api.ts`
are the first things that should get one.

## License

MIT
