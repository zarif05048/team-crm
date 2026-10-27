// Offline check of src/lib/ai/model.ts — the CRM bot's OpenRouter adapter.
//   node --experimental-strip-types scripts/test-openrouter-adapter.mjs
// A fake OpenRouter answers; nothing leaves this machine.
import assert from "node:assert/strict";

process.env.OPENROUTER_API_KEY = "test-key-not-real";
delete process.env.AI_REASONING;
const sent = [];
let replies = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  const r = replies.shift();
  return { ok: true, status: 200, json: async () => r };
};
const { createMessage, aiConfigured } = await import("../src/lib/ai/model.ts");

let n = 0;
const check = (label, a, b) => { assert.deepEqual(a, b, label); n++; console.log(`PASS ${label}`); };

check("an OpenRouter key alone turns the bot on", aiConfigured(), true);

const tools = [{ name: "check_doctor_roster", description: "rota", input_schema: { type: "object", properties: {} } }];
const params = {
  model: "claude-sonnet-5", max_tokens: 1024,
  system: [{ type: "text", text: "CLINIC FACTS", cache_control: { type: "ephemeral" } }, { type: "text", text: "TODAY" }],
  tools, tool_choice: { type: "auto" },
  messages: [{ role: "user", content: "Doktor siapa hari ini?" }],
};

replies = [{
  model: "anthropic/claude-haiku-5.5",
  choices: [{ finish_reason: "tool_calls", message: { content: "", reasoning_details: [{ type: "reasoning.text", text: "…" }],
    tool_calls: [{ id: "call_1", type: "function", function: { name: "check_doctor_roster", arguments: "{}" } }] } }],
  usage: { prompt_tokens: 100, completion_tokens: 10 },
}];
const first = await createMessage(structuredClone(params));
const req = sent[0].body;
check("goes to OpenRouter's chat endpoint", sent[0].url, "https://openrouter.ai/api/v1/chat/completions");
check("on the same model as the clinic fleet", req.model, "anthropic/claude-haiku-5.5");
check("system blocks keep the cache mark (1h on Haiku 5.5)", req.messages[0].content[0].cache_control, { type: "ephemeral", ttl: "1h" });
check("the date line stays uncached", req.messages[0].content[1].cache_control, undefined);
check("tools become functions", req.tools[0].function.name, "check_doctor_roster");
check("reasoning medium, with room for it", [req.reasoning, req.max_tokens], [{ effort: "medium" }, 4096]);
check("a tool call comes back as tool_use", [first.stop_reason, first.content.filter((b) => b.type === "tool_use").map((b) => b.name)], ["tool_use", ["check_doctor_roster"]]);

// round 2: the bot pushes the assistant turn + a tool_result, as bot.ts does
const messages = [...params.messages, { role: "assistant", content: first.content },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "Dr Ali 8am-5pm" }] }];
replies = [{ choices: [{ finish_reason: "stop", message: { content: "Dr Ali bertugas hari ini, 8 pagi - 5 petang." } }] }];
const second = await createMessage({ ...structuredClone(params), tool_choice: { type: "none" }, messages });
const req2 = sent[1].body;
const asst = req2.messages.find((m) => m.role === "assistant");
check("the tool call is handed back with its id", asst.tool_calls[0].id, "call_1");
check("reasoning travels back with it", asst.reasoning_details, [{ type: "reasoning.text", text: "…" }]);
check("the tool result goes as role tool", req2.messages.find((m) => m.role === "tool"), { role: "tool", tool_call_id: "call_1", content: "Dr Ali 8am-5pm" });
check("tool_choice none is kept for the final round", req2.tool_choice, "none");
check("the final answer is plain text", [second.stop_reason, second.content.map((b) => b.type)], ["end_turn", ["text"]]);

replies = [{ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }];
check("a provider refusal reads as a refusal", (await createMessage(structuredClone(params))).stop_reason, "refusal");

console.log(`\n${n} checks passed. No network.`);
