# Proposed app API: `dvoix.process`

Crew needs to start the agents' command line tools. The plugin API of dvoix cannot do this yet, so this is the interface Crew is written against. It is a proposal for `dvoi-dev/dvoix` (`src/lib/plugins/store/api.ts`, a Tauri command in `src-tauri/`, `PERMISSIONS` in `crates/dvoix-core/src/store.rs`, `docs/plugins/README.md`) and for `plugin-api.md` on the website. Until the app has it, Crew shows a notice in its panel instead of the chat.

## Permission

New permission `process`, shown in the store as **"Run programs on your computer, in the vault folder"**. Programs started this way run with the user's rights and are not limited to the vault, so the label must not promise more. The app should only allow it for official plugins, or show it with an extra warning.

## Calls

```ts
interface ProcessSpec {
  /** Program name (looked up on PATH) or absolute path. */
  command: string;
  args?: string[];
  /** Written to stdin, then stdin is closed. null/undefined: stdin closed right away. */
  stdin?: string | null;
  /** Extra environment variables on top of the app's environment. */
  env?: Record<string, string>;
  onStdout?(chunk: string): void; // UTF-8, any chunk size
  onStderr?(chunk: string): void;
  onExit?(code: number | null): void; // null when killed by a signal
}

interface ProcessHandle {
  kill(): void;
}

dvoix.process.spawn(spec: ProcessSpec): ProcessHandle; // needs "process"
dvoix.workspace.activeFile(): string | null;           // no permission, vault-relative path of the active tab
```

- The working directory is always the vault root, so a plugin can't choose a folder outside it.
- `spawn` throws when the program can't be started (not found), so the plugin can show an install hint.
- All processes of a plugin are killed when it is switched off or the vault is closed.

## Notes for the implementation in the app

- Rust side: `std::process::Command` in a Tauri command, stdout/stderr read in threads and sent through a `tauri::ipc::Channel`; children kept in `AppState` by id, with `process_kill(id)`.
- Windows: tools installed with npm are `.cmd` shims. Resolve the command with `PATHEXT` (or run `.cmd`/`.bat` through `cmd /C`), and set `CREATE_NO_WINDOW` so no console window opens. Crew passes prompts over stdin where the tool allows it, because `cmd.exe` mangles quotes and newlines in arguments.
- `dvoix.workspace.activeFile()` reads `vault.activeTab?.path` (null for views and empty tabs).
