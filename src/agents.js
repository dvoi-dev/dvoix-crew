// The agents Crew can talk to, without any DOM. Each agent is a command line
// tool run once per message in the vault folder. An adapter knows how to call
// the tool (`args`, what goes to stdin) and how to turn one line of its JSON
// output into the few events the chat shows:
//
//   { kind: "session", id }          id to continue the conversation with
//   { kind: "text", text }           a reply of the agent
//   { kind: "tool", name, detail }   the agent ran a tool (command, file edit, ...)
//   { kind: "done", cost? }          the turn is over
//   { kind: "error", message }
//
// The formats below are the documented machine-readable outputs of each tool
// (`claude -p --output-format stream-json`, `codex exec --json`,
// `pi --mode json`). Lines that are not JSON or not understood are ignored, so
// a newer tool version with extra events keeps working.

/** Shortens a tool input to one line for the chat. */
export function summarize(input) {
  if (input == null) return "";
  if (typeof input === "string") return oneLine(input);
  const pick = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.description;
  if (pick != null) return oneLine(Array.isArray(pick) ? pick.join(" ") : String(pick));
  return oneLine(JSON.stringify(input));
}

function oneLine(s) {
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > 160 ? line.slice(0, 157) + "…" : line;
}

function parseJson(line) {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

const claude = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  install: "npm install -g @anthropic-ai/claude-code",
  // The prompt goes over stdin: Windows' cmd.exe mangles quotes and newlines
  // in arguments of `.cmd` shims, stdin is passed through untouched.
  args({ session, extraArgs }) {
    const args = ["-p", "--output-format", "stream-json", "--verbose"];
    if (session) args.push("--resume", session);
    return [...args, ...extraArgs];
  },
  stdin: (prompt) => prompt,
  parse(line) {
    const ev = parseJson(line);
    if (!ev) return [];
    if (ev.type === "system" && ev.subtype === "init" && ev.session_id) return [{ kind: "session", id: ev.session_id }];
    if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      const out = [];
      for (const c of ev.message.content) {
        if (c.type === "text" && c.text) out.push({ kind: "text", text: c.text });
        else if (c.type === "tool_use") out.push({ kind: "tool", name: c.name, detail: summarize(c.input) });
      }
      return out;
    }
    if (ev.type === "result") {
      const out = [];
      if (ev.session_id) out.push({ kind: "session", id: ev.session_id });
      if (ev.is_error) out.push({ kind: "error", message: ev.result || ev.subtype || "Claude Code failed" });
      out.push({ kind: "done", cost: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined });
      return out;
    }
    return [];
  },
};

const codex = {
  id: "codex",
  label: "Codex",
  command: "codex",
  install: "npm install -g @openai/codex",
  // `-` makes `codex exec` read the prompt from stdin, see `claude` for why.
  args({ session, extraArgs }) {
    return session
      ? ["exec", "resume", "--json", ...extraArgs, session, "-"]
      : ["exec", "--json", ...extraArgs, "-"];
  },
  stdin: (prompt) => prompt,
  parse(line) {
    const ev = parseJson(line);
    if (!ev) return [];
    switch (ev.type) {
      case "thread.started":
        return ev.thread_id ? [{ kind: "session", id: ev.thread_id }] : [];
      case "item.completed": {
        const item = ev.item ?? {};
        if (item.type === "agent_message" && item.text) return [{ kind: "text", text: item.text }];
        if (item.type === "command_execution") return [{ kind: "tool", name: "Shell", detail: summarize(item.command) }];
        if (item.type === "file_change") {
          const files = (item.changes ?? []).map((c) => c.path).join(", ");
          return [{ kind: "tool", name: "Edit", detail: oneLine(files) }];
        }
        if (item.type === "mcp_tool_call") return [{ kind: "tool", name: item.tool ?? "MCP", detail: item.server ?? "" }];
        if (item.type === "web_search") return [{ kind: "tool", name: "Web search", detail: summarize(item.query) }];
        if (item.type === "error" && item.message) return [{ kind: "error", message: item.message }];
        return [];
      }
      case "turn.completed":
        return [{ kind: "done" }];
      case "turn.failed":
        return [{ kind: "error", message: ev.error?.message ?? "Codex failed" }, { kind: "done" }];
      case "error":
        return [{ kind: "error", message: ev.message ?? "Codex failed" }];
      default:
        return [];
    }
  },
};

const pi = {
  id: "pi",
  label: "Pi",
  command: "pi",
  install: "npm install -g @mariozechner/pi-coding-agent",
  // Pi takes the prompt as argument; it continues the latest session of the
  // folder with `--continue` instead of an id.
  args({ prompt, session, extraArgs }) {
    const args = ["--mode", "json"];
    if (session) args.push("--continue");
    return [...args, ...extraArgs, prompt];
  },
  stdin: () => null,
  parse(line) {
    const ev = parseJson(line);
    if (!ev) return [];
    if (ev.type === "session" && ev.id) return [{ kind: "session", id: ev.id }];
    if (ev.type === "message_end" && ev.message?.role === "assistant") {
      const content = Array.isArray(ev.message.content) ? ev.message.content : [];
      const out = [];
      for (const c of content) {
        if (c.type === "text" && c.text) out.push({ kind: "text", text: c.text });
        else if (c.type === "toolCall") out.push({ kind: "tool", name: c.name, detail: summarize(c.arguments) });
      }
      if (ev.message.errorMessage) out.push({ kind: "error", message: ev.message.errorMessage });
      return out;
    }
    if (ev.type === "agent_end") return [{ kind: "done" }];
    return [];
  },
};

export const AGENTS = [claude, codex, pi];

export function agentById(id) {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}

/** Splits an argument string like a shell does for simple cases: spaces separate, quotes group. */
export function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text ?? ""))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * Everything needed to start one turn: program, arguments and stdin.
 * `settings` is the agent's entry in the plugin settings.
 */
export function invocation(agent, prompt, session, settings = {}) {
  const extraArgs = splitArgs(settings.args);
  return {
    command: settings.command?.trim() || agent.command,
    args: agent.args({ prompt, session, extraArgs }),
    stdin: agent.stdin(prompt),
  };
}

/**
 * Collects output chunks into whole lines. Output arrives in pieces that can
 * end in the middle of a line, but every JSON event is exactly one line.
 */
export function lineSplitter(onLine) {
  let rest = "";
  return {
    push(chunk) {
      rest += chunk;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) if (l.trim()) onLine(l);
    },
    flush() {
      if (rest.trim()) onLine(rest);
      rest = "";
    },
  };
}

/** Builds the prompt sent to the agent, with the open note as a hint. */
export function buildPrompt(text, activeFile) {
  if (!activeFile) return text;
  return `${text}\n\n(The note open in dvoix is "${activeFile}", relative to the current folder.)`;
}
