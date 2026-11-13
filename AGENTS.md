# AGENTS.md

Fixed rules for all AI agents (Claude, Codex, Copilot, …) working in this repo. This file is the main source; `CLAUDE.md` only points here.

## What this is

Crew, the official store plugin for [dvoix](https://github.com/dvoi-dev/dvoix) that adds a chat panel for AI coding agents (Claude Code, Codex, Pi, …). Each message starts the agent's command line tool in the vault folder and shows its JSON output. The API it uses (including `dvoix.process` and the `process` permission) is described in `docs/plugins/README.md` of the app repo.

## The dvoix repos

dvoix is spread across several repositories. This section is also in the `AGENTS.md` of every repo. Whoever changes it, changes it in all of them.

| Repo | Purpose | What belongs there |
| --- | --- | --- |
| [`dvoi-dev/dvoix`](https://github.com/dvoi-dev/dvoix) | the app | Rust core, Tauri shell, Svelte frontend, core plugins, plugin API, plugin store in the app, developer guide for store plugins (`docs/plugins/`), developer README |
| [`dvoi-dev/dvoix-website`](https://github.com/dvoi-dev/dvoix-website) | product page and docs | product page at `/`, user and plugin developer docs at `/docs`, screenshots for the page, Docker image for the server |
| [`dvoi-dev/dvoix-plugins`](https://github.com/dvoi-dev/dvoix-plugins) | list of the plugin store | only `registry.json` and its check (`scripts/validate.mjs`). No plugin code |
| `dvoi-dev/dvoix-<name>` | one official store plugin each | code, `manifest.json`, releases with `manifest.json`, `main.js`, `styles.css` |

### Where does what go?

| Task | Repo |
| --- | --- |
| Basic note and editor function that is always there (explorer, search, tags, backlinks, tabs, views, …) | `dvoix`, as a core feature under `src/lib/features/` |
| Optional function that ships with the app (tasks, canvas, graph, …) | `dvoix`, as a core plugin under `src/lib/plugins/core/` |
| Extra function not everyone wants (kanban, projects, Git, tracking, …) | its own repo `dvoi-dev/dvoix-<name>` as a store plugin, plus an entry in `dvoix-plugins` |
| Extend the plugin API (`PluginContext`, permissions) | `dvoix`, plus `docs/plugins/README.md` there and the `plugin-api.md` page on the website |
| Explain how to use dvoix | `dvoix-website`, page in `src/content/docs/` |
| Offer or remove a plugin in the store | `dvoix-plugins`, `registry.json` |
| Bug in a store plugin | in the plugin's repo, not in the app |

### What is connected across repo boundaries

- **Format of the plugin list:** defined in `crates/dvoix-core/src/store.rs` (`parse_registry`) of the app, example in `docs/plugins/registry.example.json`, checked by `scripts/validate.mjs` in `dvoix-plugins`. If the format changes, all three places change.
- **Address of the plugin list:** the app reads `https://raw.githubusercontent.com/dvoi-dev/dvoix-plugins/main/registry.json`. Never change the repo name, the branch `main` or the file name, or no installed app finds plugins anymore.
- **Official:** `"channel": "official"` only applies to repos of `dvoi-dev`. The app and the check in `dvoix-plugins` both enforce this.
- **Plugin API:** `src/lib/plugins/store/api.ts` in the app, `docs/plugins/README.md` in the app and `src/content/docs/plugin-api.md` on the website describe the same API and must match.
- **Features of the app:** what the website docs say about the app must match the code in `dvoix`. If the app changes in a way users see, the docs are updated.

### Changes across several repos

- One PR per repo. The PRs link to each other in their descriptions.
- Merge order: first the app (`dvoix`), then `dvoix-plugins` and `dvoix-website`. A doc or plugin list must not promise anything the app does not yet support on `main`.
- For all repos the same applies: code, comments and commit messages in English, everything users see in English too; always the newest stable versions of Node.js, dependencies and GitHub Actions; never push directly to `main`.

## Basic rules

1. **The agents do the work, Crew only shows it.** No own model calls, no API keys stored by Crew. Each tool uses its own login and settings.
2. **One adapter per agent** in `src/agents.js`: how to call the tool and how to turn one output line into chat events. Unknown lines are ignored, so new tool versions don't break the chat. Every adapter has tests.
3. **Prompts over stdin** where the tool allows it: `cmd.exe` on Windows mangles quotes and newlines in arguments.
4. **Only the API, no app internals.** Crew talks to the app only through the `dvoix` object. Calls older app versions don't have (`dvoix.process`, `dvoix.workspace`) are checked before use.
5. **Never change the `id`** (`crew`). It is the folder name in `<vault>/.dvoix/plugins/crew/` and the key in the plugin list.
6. **Do not copy code from other plugins** (e.g. Claudian) without checking its license; Crew only takes ideas.
7. **Always the newest versions** of Node.js (`.nvmrc`, `engines`), esbuild and the GitHub Actions.
8. **Everything is in English**: code, comments, commit messages, UI texts, README.

## Layout

```
manifest.json          id, name, version, permissions; becomes a release asset as is
styles.css             styles, all classes prefixed with crew-; becomes a release asset as is
src/main.js            entry point: registers the panel and the settings page
src/agents.js          agent adapters, argument building, line splitting (no DOM)
src/view.js            chat panel and settings page (plain DOM)
test/agents.test.js    tests for the adapters (node --test)
scripts/build.mjs      bundles src/ into dist/main.js and copies manifest.json and styles.css
.github/workflows/     ci.yml (test + build), release.yml (release on main)
```

## Commands

```sh
npm install      # once
npm test         # adapter tests
npm run build    # dist/ with manifest.json, main.js, styles.css
```

Both must pass before every commit, as in the CI. If a check cannot run locally, say so instead of claiming success.

## Releasing

A release is created by `release.yml` when `main` has a `version` in `manifest.json` that has no release yet. To release: raise the version in `manifest.json` **and** `package.json` (the build fails if they differ) in a PR, merge it. Tags are the version without `v`. Never move or delete a published tag.

## Conventions

- Comments explain the why, not the what. Every file starts with a short comment on what it is for.
- `main.js` is one ES module without imports, bundled with esbuild. No runtime dependencies.
- Colors only through the app's CSS variables with the value as fallback. Violet is the only accent color.
- Small, focused changes, one topic per PR. Never push directly to `main`.
