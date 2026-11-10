// Entry point of Crew for dvoix: a chat panel in the sidebar that talks to AI
// coding agents (Claude Code, Codex, Pi) running in the vault folder.
// Bundled into a single `main.js` by `npm run build`, because the app loads
// store plugins as one ES module without imports.
import { AGENTS } from "./agents.js";
import { mountChat, mountSettings } from "./view.js";

const icon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/></svg>';

const DEFAULTS = { agent: AGENTS[0].id, includeNote: true, sessions: {}, agents: {} };

export default {
  async onload(dvoix) {
    const data = { ...DEFAULTS, ...(await dvoix.loadData(DEFAULTS)) };
    data.sessions ??= {};
    data.agents ??= {};
    const state = { data, save: () => dvoix.saveData(data) };

    dvoix.addPanel({ id: "chat", label: "Crew", icon, mount: (el) => mountChat(el, dvoix, state) });
    dvoix.addSettingTab({ mount: (el) => mountSettings(el, state) });
  },

  onunload() {
    // Panels and settings are removed by dvoix; the panel's cleanup stops a running agent.
  },
};
