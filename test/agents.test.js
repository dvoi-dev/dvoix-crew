// Tests for the agent adapters: how each CLI is called and how its JSON
// output becomes chat events (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentById, buildPrompt, invocation, lineSplitter, splitArgs, summarize } from "../src/agents.js";

const claude = agentById("claude");
const codex = agentById("codex");
const pi = agentById("pi");

test("claude: prompt over stdin, resume with session id", () => {
  const first = invocation(claude, "hi", undefined, {});
  assert.deepEqual(first, { command: "claude", args: ["-p", "--output-format", "stream-json", "--verbose"], stdin: "hi" });
  const next = invocation(claude, "more", "abc", { command: " /opt/claude ", args: '--model "opus x"' });
  assert.equal(next.command, "/opt/claude");
  assert.deepEqual(next.args.slice(-4), ["--resume", "abc", "--model", "opus x"]);
});

test("claude: stream-json events", () => {
  assert.deepEqual(claude.parse('{"type":"system","subtype":"init","session_id":"s1"}'), [{ kind: "session", id: "s1" }]);
  const msg = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "Hello" }, { type: "tool_use", name: "Read", input: { file_path: "a.md" } }] },
  });
  assert.deepEqual(claude.parse(msg), [
    { kind: "text", text: "Hello" },
    { kind: "tool", name: "Read", detail: "a.md" },
  ]);
  assert.deepEqual(claude.parse('{"type":"result","session_id":"s1","total_cost_usd":0.01}'), [
    { kind: "session", id: "s1" },
    { kind: "done", cost: 0.01 },
  ]);
  assert.equal(claude.parse('{"type":"result","is_error":true,"result":"boom"}')[0].message, "boom");
  assert.deepEqual(claude.parse("not json"), []);
});

test("codex: exec and resume, json events", () => {
  assert.deepEqual(invocation(codex, "x", null).args, ["exec", "--json", "-"]);
  assert.deepEqual(invocation(codex, "x", "t1").args, ["exec", "resume", "--json", "t1", "-"]);
  assert.deepEqual(codex.parse('{"type":"thread.started","thread_id":"t1"}'), [{ kind: "session", id: "t1" }]);
  assert.deepEqual(codex.parse('{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}'), [
    { kind: "text", text: "Done" },
  ]);
  assert.deepEqual(codex.parse('{"type":"item.completed","item":{"type":"command_execution","command":"ls -la"}}'), [
    { kind: "tool", name: "Shell", detail: "ls -la" },
  ]);
  assert.deepEqual(codex.parse('{"type":"turn.completed"}'), [{ kind: "done" }]);
});

test("pi: prompt as argument, continue", () => {
  assert.deepEqual(invocation(pi, "x", null), { command: "pi", args: ["--mode", "json", "x"], stdin: null });
  assert.deepEqual(invocation(pi, "x", "s").args, ["--mode", "json", "--continue", "x"]);
  const end = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Yo" }] } });
  assert.deepEqual(pi.parse(end), [{ kind: "text", text: "Yo" }]);
});

test("lineSplitter joins chunks into lines", () => {
  const got = [];
  const s = lineSplitter((l) => got.push(l));
  s.push('{"a":');
  s.push('1}\r\n{"b"');
  s.push(":2}\n\n");
  s.push("tail");
  s.flush();
  assert.deepEqual(got, ['{"a":1}', '{"b":2}', "tail"]);
});

test("helpers", () => {
  assert.deepEqual(splitArgs(`a "b c" 'd' e`), ["a", "b c", "d", "e"]);
  assert.deepEqual(splitArgs(undefined), []);
  assert.equal(summarize({ command: ["git", "status"] }), "git status");
  assert.equal(buildPrompt("q", null), "q");
  assert.match(buildPrompt("q", "Notes/a.md"), /Notes\/a\.md/);
  assert.equal(agentById("unknown").id, "claude");
});
