# dvoix Crew

Chat with AI coding agents in the sidebar of [dvoix](https://github.com/dvoi-dev/dvoix). Crew runs the agent you pick in your vault folder, so it can read, search and change your notes. Official store plugin: install it in dvoix under **Settings → Plugin store**.

> Crew needs the `process` plugin permission, which dvoix does not have yet. The planned API is described in [docs/process-api.md](docs/process-api.md). Until the app supports it, the panel shows a notice.

## Agents

| Agent | Install | How Crew calls it |
| --- | --- | --- |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude -p --output-format stream-json --verbose [--resume <id>]`, prompt on stdin |
| Codex | `npm install -g @openai/codex` | `codex exec --json -` / `codex exec resume --json <id> -`, prompt on stdin |
| Pi | `npm install -g @mariozechner/pi-coding-agent` | `pi --mode json [--continue] <prompt>` |

Sign in to each tool once in a terminal as usual; Crew uses the tool's own login and settings. Adding another agent means one adapter object in `src/agents.js`.

## What it does

- Panel **Crew** in the sidebar: pick an agent, write a message, Enter sends, Shift+Enter adds a line, the button stops a running agent.
- Shows the agent's replies, which tools it used (commands, file edits, …) and, for Claude Code, the cost of the turn.
- Conversations continue: Crew remembers the last session per agent in `.dvoix/plugins/crew/data.json`. **New chat** starts over.
- **Mention open note** adds the path of the open note to the message, so you can say "summarize this".
- Settings: program path and extra arguments per agent (e.g. `--model`, or the tool's permission flags).

Agents change files in the vault directly; dvoix picks the changes up like any other change on disk. Use Git (or the Git core plugin) if you want to review or undo them.

## Development

```sh
npm install
npm test        # adapter tests
npm run build   # dist/ with manifest.json, main.js, styles.css
```

Releases are made by CI: raise `version` in `manifest.json` and `package.json` in a PR and merge it.

Crew is inspired by the features of [Claudian](https://github.com/YishenTu/claudian) for Obsidian but contains none of its code.

## License

MIT or Apache-2.0, at your choice.
