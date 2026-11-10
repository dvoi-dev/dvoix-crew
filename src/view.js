// The chat panel of Crew (plain DOM). One conversation at a time with the
// chosen agent; each message starts the agent's CLI through
// `dvoix.process.spawn` and shows its events as they come in. The agent keeps
// the conversation itself (its session id), so the panel only remembers that
// id per agent in the plugin data and can continue after a restart.
import { AGENTS, agentById, buildPrompt, invocation, lineSplitter } from "./agents.js";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Text with ``` fences shown as code blocks; everything else stays plain text. */
function renderText(target, text) {
  const parts = text.split(/```[^\n]*\n?/);
  parts.forEach((part, i) => {
    if (!part) return;
    target.append(i % 2 ? el("pre", "crew-code", part.replace(/\n$/, "")) : el("div", "crew-prose", part));
  });
}

export function mountChat(root, dvoix, state) {
  const { data, save } = state;
  root.classList.add("crew-panel");

  const bar = el("div", "crew-bar");
  const picker = el("select", "crew-select");
  for (const a of AGENTS) {
    const o = el("option", null, a.label);
    o.value = a.id;
    picker.append(o);
  }
  picker.value = data.agent;
  const newChat = el("button", "crew-btn", "New chat");
  newChat.title = "Start a new conversation with this agent";
  bar.append(picker, newChat);

  const log = el("div", "crew-log");
  const form = el("form", "crew-form");
  const input = el("textarea", "crew-input");
  input.rows = 3;
  input.placeholder = "Ask the agent… (Enter sends, Shift+Enter new line)";
  const row = el("div", "crew-row");
  const noteLabel = el("label", "crew-check");
  const noteBox = el("input");
  noteBox.type = "checkbox";
  noteBox.checked = data.includeNote;
  noteLabel.append(noteBox, document.createTextNode(" Mention open note"));
  const send = el("button", "crew-btn crew-primary", "Send");
  send.type = "submit";
  row.append(noteLabel, send);
  form.append(input, row);
  root.append(bar, log, form);

  const hasProcess = typeof dvoix.process?.spawn === "function";
  let running = null;

  const agent = () => agentById(picker.value);
  const scroll = () => (log.scrollTop = log.scrollHeight);

  function add(cls, text) {
    const m = el("div", `crew-msg ${cls}`);
    renderText(m, text);
    log.append(m);
    scroll();
    return m;
  }

  function info(text) {
    log.append(el("div", "crew-info", text));
    scroll();
  }

  function greet() {
    log.replaceChildren();
    if (!hasProcess) {
      info("This version of dvoix cannot start programs for plugins yet. Crew needs an app update with the \"process\" plugin permission.");
      return;
    }
    const a = agent();
    info(
      data.sessions[a.id]
        ? `Continuing your last conversation with ${a.label}. "New chat" starts over.`
        : `${a.label} runs in your vault folder and can read and change its files. Install it first if needed: ${a.install}`,
    );
  }

  function setBusy(busy) {
    send.textContent = busy ? "Stop" : "Send";
    send.classList.toggle("crew-stop", busy);
    picker.disabled = busy;
    newChat.disabled = busy;
  }

  function run(text) {
    const a = agent();
    const file = noteBox.checked ? dvoix.workspace?.activeFile?.() : null;
    const call = invocation(a, buildPrompt(text, file), data.sessions[a.id], data.agents[a.id]);
    add("crew-user", text);
    const thinking = el("div", "crew-info crew-thinking", `${a.label} is working…`);
    log.append(thinking);
    scroll();

    let stderr = "";
    let gotText = false;
    let errored = false;
    const handle = (ev) => {
      if (ev.kind === "session") {
        data.sessions[a.id] = ev.id;
        save();
      } else if (ev.kind === "text") {
        gotText = true;
        log.insertBefore(add("crew-agent", ev.text), thinking);
      } else if (ev.kind === "tool") {
        const t = el("div", "crew-tool");
        t.append(el("span", "crew-tool-name", ev.name), document.createTextNode(` ${ev.detail}`));
        log.insertBefore(t, thinking);
      } else if (ev.kind === "error") {
        errored = true;
        log.insertBefore(add("crew-error", ev.message), thinking);
      } else if (ev.kind === "done" && ev.cost != null) {
        log.insertBefore(el("div", "crew-info", `Cost: $${ev.cost.toFixed(4)}`), thinking);
      }
      scroll();
    };
    const lines = lineSplitter((line) => a.parse(line).forEach(handle));

    const finish = (message) => {
      lines.flush();
      thinking.remove();
      if (message) add("crew-error", message);
      running = null;
      setBusy(false);
      input.focus();
    };

    try {
      const proc = dvoix.process.spawn({
        command: call.command,
        args: call.args,
        stdin: call.stdin,
        onStdout: (chunk) => lines.push(chunk),
        onStderr: (chunk) => (stderr += chunk),
        onExit: (code) => {
          if (running?.stopped) return finish("Stopped.");
          const failed = code !== 0 && !errored;
          const notFound = /Program not found/.test(stderr) ? ` Install it with: ${a.install}` : "";
          const hint = !gotText && !errored && code !== 0 ? (stderr.trim().slice(-2000) || `${a.label} exited with code ${code}.`) + notFound : null;
          finish(failed ? hint || `${a.label} exited with code ${code}.` : null);
        },
      });
      running = { proc, stopped: false };
      setBusy(true);
    } catch (e) {
      finish(`Could not start "${call.command}": ${e?.message ?? e}. Is ${a.label} installed and on your PATH? (${a.install})`);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (running) {
      running.stopped = true;
      running.proc.kill();
      return;
    }
    const text = input.value.trim();
    if (!text || !hasProcess) return;
    input.value = "";
    run(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  picker.addEventListener("change", () => {
    data.agent = picker.value;
    save();
    greet();
  });
  newChat.addEventListener("click", () => {
    delete data.sessions[agent().id];
    save();
    greet();
  });
  noteBox.addEventListener("change", () => {
    data.includeNote = noteBox.checked;
    save();
  });

  greet();
  return () => {
    if (running) running.proc.kill();
    root.replaceChildren();
  };
}

/** Settings page: which program and extra arguments to use per agent. */
export function mountSettings(root, state) {
  const { data, save } = state;
  root.classList.add("crew-settings");
  root.append(
    el("p", "crew-hint", "Crew starts these programs in your vault folder. Leave a field empty for the default. Extra arguments are added to every call, e.g. --model or permission flags."),
  );
  for (const a of AGENTS) {
    const conf = (data.agents[a.id] ??= {});
    const box = el("fieldset", "crew-field");
    box.append(el("legend", null, a.label));
    for (const [key, label, placeholder] of [
      ["command", "Program", a.command],
      ["args", "Extra arguments", ""],
    ]) {
      const l = el("label", "crew-label", label);
      const i = el("input", "crew-text");
      i.placeholder = placeholder;
      i.value = conf[key] ?? "";
      i.addEventListener("change", () => {
        conf[key] = i.value;
        save();
      });
      l.append(i);
      box.append(l);
    }
    box.append(el("div", "crew-hint", `Install: ${a.install}`));
    root.append(box);
  }
  return () => root.replaceChildren();
}
