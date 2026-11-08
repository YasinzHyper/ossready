# Project configuration

Persistent filters and strict mode for `ossready doctor` so local runs and CI stay in sync without repeating `--check` / `--skip` / `--strict` on every invocation. Full command reference: [commands.md](commands.md). Check ids: [checks.md](checks.md). Copy-paste recipes: [examples.md](examples.md).

## Discovery

First match wins:

1. `--config <path>` (resolved from the current working directory; missing file → error)
2. `.ossreadyrc` in the audited directory
3. `.ossreadyrc.json`
4. `.ossready.json`
5. the `"ossready"` key in that directory's `package.json`

`--ignore-config` skips discovery. An explicit `--config` still wins over `--ignore-config`.

## Init scaffold

`ossready init` writes a starter `.ossreadyrc` in the project root:

```json
{
  "$schema": "https://raw.githubusercontent.com/YasinzHyper/ossready/main/schema/ossreadyrc.schema.json"
}
```

Only `$schema` is set, so editors validate the file immediately and `ossready doctor` still runs every check until you add `check` / `skip`. The file is not managed by `ossready sync` — customize it freely. Existing repos can run `ossready config --init` (or copy the same starter by hand; after installing the package you can also point `"$schema"` at `./node_modules/ossready/schema/ossreadyrc.schema.json`). Use `ossready config` to print the effective discovered config, or `ossready config --json` for machine-readable output.

## Shape

Top-level object (or the value of `package.json#ossready`):

| Key        | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `$schema`  | Optional. Points editors at the JSON Schema shipped with this package.  |
| `check`    | Only run these check ids (same as `--check`).                           |
| `skip`     | Skip these check ids (same as `--skip`).                                |
| `strict`   | `true` also fails on missing recommended checks (same as `--strict`).   |
| `doctor`   | Optional nested `{ check?, skip?, strict? }`. Nested fields win.        |

`strict` must be `true` or `false`. `check` and `skip` accept a string, a comma-separated string, or an array of strings — the same tokens as the CLI flags. Unknown check ids fail with a did-you-mean suggestion (same as the flags). Unknown config keys also fail with a did-you-mean suggestion (`skipp` → `skip`).

```json
{
  "$schema": "https://raw.githubusercontent.com/YasinzHyper/ossready/main/schema/ossreadyrc.schema.json",
  "skip": ["funding", "citation"],
  "strict": true
}
```

```json
{
  "ossready": {
    "doctor": {
      "skip": ["funding", "citation"]
    }
  }
}
```

## Merge with CLI flags

- CLI `--check` **replaces** a config `check`.
- CLI `--skip` is **added** to config `skip` (persistent skips stay on).
- CLI `--strict` turns strict mode on regardless of config; config `"strict": true` turns it on when the flag is absent. `--ignore-config` drops a config `strict` for one run. Plain and Markdown reports print `Strict: on via <config>` and `--json` includes `strict` / `strictSource`.
- Plain / Markdown / `--json` reports include `filter.config` when a file contributed.

## JSON Schema

The schema lives at [`schema/ossreadyrc.schema.json`](../schema/ossreadyrc.schema.json) in this repo and is published in the npm package:

- Package path: `schema/ossreadyrc.schema.json`
- Package export: `ossready/schema.json` (`require` / `import` subpath)
- Editor-friendly URL on `main`:

```text
https://raw.githubusercontent.com/YasinzHyper/ossready/main/schema/ossreadyrc.schema.json
```

After installing the package, you can also point `$schema` at the local file:

```json
{
  "$schema": "./node_modules/ossready/schema/ossreadyrc.schema.json",
  "skip": ["funding"]
}
```

The loader and the schema agree on allowed keys and on `check` / `skip` value shapes; `tests/config-schema.test.ts` keeps them in sync.
