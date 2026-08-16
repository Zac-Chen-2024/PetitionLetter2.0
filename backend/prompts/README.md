# Prompt registry

Every LLM prompt used by the backend lives here as a versioned file, loaded by
`app/core/prompt_loader.py`. Code never contains prompt text longer than a
line or two.

```
prompts/<module>/<name>@v<N>.md
```

| module | used by |
|---|---|
| `extractor/`     | `unified_extractor.py` (EB-1A / NIW / L-1A extraction) |
| `organizer/`     | `legal_argument_organizer.py` (argument organisation, top-down pickup, per-standard `*_requirements_*` texts) |
| `subdivider/`    | `subargument_generator.py` (sub-argument subdivision + per-standard guidance) |
| `writer/`        | `petition_writer_v3.py` (step 1/2/3, edit, recover ids) and `writing_strategies.py` (base system prompts, appendices, instructions) |
| `recommender/`   | `snippet_recommender.py` (recommend / infer relationship / infer title / consolidate) |
| `entity_merger/` | `entity_merger.py` |

## File format

```
---
id: writer/step1_generate_subargument_body_user_prompt
version: 1
format: python          # python = str.format() template | raw = used verbatim (may contain single braces)
variables: ["subargument_title", "argument_title", ...]   # must equal the placeholders in the body
---
<body, verbatim>
```

* `format: python` bodies are Python `str.format()` templates: `{name}` placeholders, literal braces as `{{ }}`.
* `format: raw` bodies are returned as-is via `prompt_loader.body(id)`; callers may `.format()` them
  themselves (legacy constants) or concatenate them.

## Rules

1. **Wording changes are `prompt:` commits, nothing else in the diff.**
2. Changing a body **without** bumping the version fails `tests/test_prompts.py`
   (hash snapshot in `tests/fixtures/prompt_hashes.json`). Either bump to `@v2`
   (new file, old one stays for reproducibility) or, for a deliberate in-place
   fix, refresh the snapshot in the same `prompt:` commit:
   `python -c "from tests.test_prompts import refresh; refresh()"`
3. `validate_all()` runs at startup: every file must parse and its `variables`
   must equal the placeholders it uses.
4. `render()` returns a `str` subclass carrying `prompt_id / version / hash`;
   the LLM client writes those into the trace (M9), so every model output can
   be tied to the exact prompt text that produced it.
