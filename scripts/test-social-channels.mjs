// Facebook Messenger and TikTok direct messages in the inbox (owner, 12 Nov
// 2026). Offline: src/lib/social/*.ts is transpiled and run against a stand-in
// database — no Meta, no TikTok, no Supabase.
// Run: node scripts/test-social-channels.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

process.env.META_APP_SECRET = "test-app-secret";
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const src = readFileSync(new URL(`../src/lib/social/${name}.ts`, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  cache.set(name, mod);
  const require = (id) => (id === "node:crypto" ? crypto : id.startsWith("./") ? load(id.slice(2)) : {});
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require, process, Buffer, URL, console, Date, JSON, Math, Object, Number, String });
  return mod.exports;
}
const L = load("lines"), E = load("events"), S = load("seal"), I = load("ingest");

let n = 0;
const check = async (label, fn) => { await fn(); n++; console.log("PASS  " + label); };
const plain = (v) => JSON.parse(JSON.stringify(v));
// values made inside the transpiled modules belong to another realm: compared as plain data
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

/* A stand-in for the Supabase calls ingest.ts makes: tables of rows, the
   unique keys that matter, and chains that resolve when awaited. */
function fakeAdmin() {
  const rows = { whatsapp_numbers: [], contacts: [], conversations: [], tags: [], conversation_tags: [], messages: [] };
  const unique = { whatsapp_numbers: "phone_number_id", contacts: "wa_id", tags: "name", messages: "wa_message_id" };
  let id = 0;
  const admin = {
    rows,
    from(table) {
      const filters = []; let op = "select", payload = null, order = null, limit = null, conflict = null;
      const match = (r) => filters.every(([k, c, v]) => (k === "eq" ? r[c] === v : r[c] >= v));
      const run = () => {
        const t = rows[table];
        if (op === "insert") {
          const key = unique[table];
          if (key && payload[key] != null && t.some((r) => r[key] === payload[key])) return { data: null, error: { code: "23505", message: "duplicate" } };
          const row = { id: `${table}-${++id}`, bot_enabled: true, ...payload };
          t.push(row); return { data: [row], error: null };
        }
        if (op === "upsert") {
          const key = conflict || (table === "conversation_tags" ? null : unique[table]);
          const found = key ? t.find((r) => r[key] === payload[key]) : t.find((r) => r.conversation_id === payload.conversation_id && r.tag_id === payload.tag_id);
          if (found) { Object.assign(found, payload); return { data: [found], error: null }; }
          const row = { id: `${table}-${++id}`, ...payload }; t.push(row); return { data: [row], error: null };
        }
        if (op === "update") { const hit = t.filter(match); hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
        let out = t.filter(match);
        if (order) out = out.slice().sort((a, b) => (a[order.col] < b[order.col] ? 1 : -1) * (order.asc ? -1 : 1));
        if (limit != null) out = out.slice(0, limit);
        return { data: out, error: null };
      };
      const q = {
        select() { return q; },
        insert(row) { op = "insert"; payload = row; return q; },
        upsert(row, o) { op = "upsert"; payload = row; conflict = o?.onConflict ?? null; return q; },
        update(row) { op = "update"; payload = row; return q; },
        eq(c, v) { filters.push(["eq", c, v]); return q; },
        gte(c, v) { filters.push(["gte", c, v]); return q; },
        order(col, o) { order = { col, asc: o?.ascending !== false }; return q; },
        limit(k) { limit = k; return q; },
        single() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error ?? (r.data?.[0] ? null : { message: "no row" }) }); },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
        then(ok, bad) { return Promise.resolve(run()).then(ok, bad); },
      };
      return q;
    },
  };
  return admin;
}

/* ------------------------------- lines ------------------------------- */

await check("a line's id carries the provider, the clinic and the account", () => {
  const id = L.lineId("facebook", "paka", "61585001010235");
  assert.equal(id, "fb:paka:61585001010235");
  eq((L.socialLineOf(id)), { provider: "facebook", account: "facebook", clinic: "paka", externalId: "61585001010235", branch: "Paka", clinicName: "Klinik Hijraa 24 Jam Paka" });
  // the comments under the same page: a line of their own, on the page's connection
  const cid = L.lineId("fbcomments", "paka", "61585001010235");
  assert.equal(cid, "fbc:paka:61585001010235");
  eq([L.socialLineOf(cid).provider, L.socialLineOf(cid).account, L.socialLineOf(cid).externalId], ["fbcomments", "facebook", "61585001010235"]);
  assert.equal(L.providerOf("fbc:123"), "fbcomments");
  assert.equal(L.providerOf("fb:123"), "facebook");
  assert.equal(L.lineName("fbcomments", "dungun"), "Facebook Comments · Dungun");
  assert.match(L.windowClosedNote("fbcomments"), /7 days/);
  assert.match(L.socialChatNote("fbc:dungun:P1"), /ONE PRIVATE Messenger message/);
  assert.equal(L.socialLineOf(L.lineId("tiktok", "dungun", "abc:def")).externalId, "abc:def", "an account id may itself hold a colon");
  for (const other of ["web:dungun", "unofficial:hijraa-paka", "1244016635452219", "fb:kl:123", "fb:dungun:", "", null]) {
    assert.equal(L.socialLineOf(other), null, String(other));
  }
  assert.equal(L.providerOf("tt:conv-1"), "tiktok");
  assert.equal(L.isSocial("web:abc"), false);
  assert.equal(L.bareId(L.contactId("facebook", "24680")), "24680");
  assert.equal(L.lineName("tiktok", "dungun"), "TikTok · Dungun");
});

await check("the reply window: 24 hours on Facebook, 48 on TikTok, shut with no message", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const ago = (h) => new Date(now - h * 3_600_000).toISOString();
  assert.equal(L.socialWindowOpen("facebook", ago(23.9), now), true);
  assert.equal(L.socialWindowOpen("facebook", ago(24.1), now), false);
  assert.equal(L.socialWindowOpen("tiktok", ago(47.9), now), true);
  assert.equal(L.socialWindowOpen("tiktok", ago(48.1), now), false);
  assert.equal(L.socialWindowOpen("tiktok", null, now), false);
  assert.match(L.windowClosedNote("tiktok"), /48 hours/);
  assert.match(L.windowClosedNote("facebook"), /24 hours/);
});

await check("a long reply is cut into pieces the provider accepts, nothing lost", () => {
  eq((L.chunkText("  Hello  ", 2000)), ["Hello"]);
  const paras = Array.from({ length: 30 }, (_, i) => `Perenggan ${i + 1}: ` + "kata ".repeat(40).trim()).join("\n\n");
  const pieces = L.chunkText(paras, 2000);
  assert.ok(pieces.length > 1 && pieces.every((p) => p.length <= 2000 && p.length > 0));
  assert.equal(pieces.join("\n\n").replace(/\s+/g, " "), paras.replace(/\s+/g, " "));
  assert.ok(pieces.slice(0, -1).every((p) => !p.endsWith("kata kat")), "cut at a paragraph, not mid-word");
  eq((L.chunkText("x".repeat(4500), 2000)).map((p) => p.length), [2000, 2000, 500]);
});

await check("a Facebook page is matched to its clinic by name; the bot is told the channel", () => {
  assert.equal(L.clinicFromName("Klinik Hijraa 24 Jam Paka"), "paka");
  assert.equal(L.clinicFromName("Klinik Perubatan Hijraa Dungun"), "dungun");
  assert.equal(L.clinicFromName("Some other page"), null);
  const note = L.socialChatNote("tt:dungun:acc1");
  assert.match(note, /TikTok/); assert.match(note, /Dungun branch/); assert.match(note, /48 hours/); assert.match(note, /NOT WhatsApp/);
  assert.equal(L.socialChatNote("web:dungun"), null);
});

/* ------------------------------ Facebook ------------------------------ */

const APP = "1013631327812903";
const fb = (messaging) => ({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging }] });

await check("Messenger: a person's text, a photo, a sticker, a button tap", () => {
  const evs = E.parseFacebookWebhook(fb([
    { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1794400000000, message: { mid: "m1", text: " Berapa harga sunat? " } },
    { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1794400001000, message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://cdn.example/p.jpg" } }] } },
    { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1794400002000, message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn.example/s.png", sticker_id: 369239263222822 } }] } },
    { sender: { id: "U2" }, recipient: { id: "PAGE1" }, timestamp: 1794400003000, postback: { title: "Get Started", payload: "GS" } },
    { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1794400004000, delivery: { mids: ["m9"] } },
    { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1794400005000, message: { mid: "m4", attachments: [{ type: "audio", payload: { url: "https://cdn.example/a.mp4" } }] } },
  ]), APP);
  eq(evs.map((e) => [e.direction, e.userId, e.type, e.body]), [
    ["in", "U1", "text", "Berapa harga sunat?"],
    ["in", "U1", "image", "📷 Photo"],
    ["in", "U1", "image", "Sticker"],
    ["in", "U2", "text", "Get Started"],
    ["in", "U1", "text", "🎙️ Voice message"],
  ]);
  assert.equal(evs[1].mediaUrl, "https://cdn.example/p.jpg");
  assert.equal(evs[0].accountId, "PAGE1");
  assert.equal(evs[0].at, new Date(1794400000000).toISOString());
  eq((E.parseFacebookWebhook({ object: "whatsapp_business_account", entry: [] }, APP)), []);
});

await check("Messenger: an echo is the page writing — ours when our own app sent it", () => {
  const evs = E.parseFacebookWebhook(fb([
    { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 1, message: { mid: "e1", text: "Dari CRM", is_echo: true, app_id: Number(APP) } },
    { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 2, message: { mid: "e2", text: "Dari Business Suite", is_echo: true, app_id: 263902037430900 } },
  ]), APP);
  eq(evs.map((e) => [e.direction, e.userId, !!e.own]), [["out", "U1", true], ["out", "U1", false]]);
});

await check("two Meta apps (WhatsApp, and the pages' own): an echo from either is ours", () => {
  const PAGES_APP = "1495824135726475";
  const evs = E.parseFacebookWebhook(fb([
    { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 1, message: { mid: "e1", text: "a", is_echo: true, app_id: Number(APP) } },
    { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 2, message: { mid: "e2", text: "b", is_echo: true, app_id: Number(PAGES_APP) } },
    { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 3, message: { mid: "e3", text: "c", is_echo: true, app_id: 263902037430900 } },
  ]), [PAGES_APP, APP]);
  eq(evs.map((e) => !!e.own), [true, true, false]);
});

/* ------------------------------- TikTok ------------------------------- */

const tt = (event, content) => ({ event, user_openid: "BIZ1", content: JSON.stringify(content) });

await check("TikTok: a person's message, the account's own, a shared video, an unknown kind", () => {
  const inbound = E.parseTikTokWebhook(tt("im_receive_msg", {
    conversation_id: "CONV1", message_id: "t1", type: "text", text: { body: "Ada buat cuci telinga?" }, timestamp: 1794400000000,
    from: "aminah88", to: "klinikhijraadungun", from_user: { id: "USER9" }, to_user: { id: "BIZ1" },
  }));
  eq((inbound), [{
    provider: "tiktok", accountId: "BIZ1", userId: "CONV1", userName: "aminah88", direction: "in", messageId: "t1",
    at: new Date(1794400000000).toISOString(), type: "text", body: "Ada buat cuci telinga?",
  }]);
  const out = E.parseTikTokWebhook(tt("im_send_msg", {
    conversation_id: "CONV1", message_id: "t2", type: "text", text: { body: "Ada, Puan." }, timestamp: 1,
    from: "klinikhijraadungun", to: "aminah88", from_user: { id: "BIZ1" }, to_user: { id: "USER9" },
  }));
  eq([out[0].direction, out[0].userId, out[0].userName], ["out", "CONV1", "aminah88"]);
  const share = E.parseTikTokWebhook(tt("im_receive_msg", { conversation_id: "C", message_id: "t3", type: "share_post", share_post: { embed_url: "https://www.tiktok.com/embed/1" }, to_user: { id: "BIZ1" } }));
  assert.match(share[0].body, /Shared a TikTok video: https:\/\/www\.tiktok\.com\/embed\/1/);
  assert.equal(E.parseTikTokWebhook(tt("im_receive_msg", { conversation_id: "C", message_id: "t4", type: "video", to_user: { id: "BIZ1" } }))[0].body, "[Unsupported message — open TikTok to view]");
  assert.equal(E.parseTikTokWebhook(tt("im_receive_msg", { conversation_id: "C", message_id: "t5", type: "image", image: { media_id: "x" }, to_user: { id: "BIZ1" } }))[0].type, "image");
  eq((E.parseTikTokWebhook(tt("im_mark_read_msg", { conversation_id: "C" }))), [], "a read receipt is not a message");
  eq((E.parseTikTokWebhook({ event: "im_receive_msg", user_openid: "BIZ1", content: "{not json" })), []);
});

await check("TikTok's signature: right secret and a fresh time, or refused", () => {
  const raw = JSON.stringify(tt("im_receive_msg", { conversation_id: "C" }));
  const now = 1794400000;
  const sign = (secret, t, body = raw) => `t=${t},s=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  assert.equal(E.verifyTikTokSignature(raw, sign("sek", now), "sek", now), true);
  assert.equal(E.verifyTikTokSignature(raw, sign("sek", now - 200), "sek", now), true);
  assert.equal(E.verifyTikTokSignature(raw, sign("sek", now - 400), "sek", now), false, "an old one is a replay");
  assert.equal(E.verifyTikTokSignature(raw, sign("other", now), "sek", now), false);
  assert.equal(E.verifyTikTokSignature(raw + " ", sign("sek", now), "sek", now), false, "a changed body");
  assert.equal(E.verifyTikTokSignature(raw, null, "sek", now), false);
  assert.equal(E.verifyTikTokSignature(raw, sign("sek", now), undefined, now), false, "no secret set: nothing is accepted");
  assert.equal(E.verifyTikTokSignature(raw, "t=abc,s=zz", "sek", now), false);
});

/* ---------------------------- sealed tokens ---------------------------- */

await check("a token is stored sealed: not readable in the row, opens with the key, fails if altered", () => {
  const sealed = S.seal("EAAG-page-token-123");
  assert.ok(sealed.startsWith("v1.") && !sealed.includes("EAAG"));
  assert.notEqual(S.seal("EAAG-page-token-123"), sealed, "sealed fresh each time");
  assert.equal(S.unseal(sealed), "EAAG-page-token-123");
  const parts = sealed.split("."); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
  assert.throws(() => S.unseal(parts.join(".")));
  assert.throws(() => S.unseal("plain-token"));
  process.env.META_APP_SECRET = "another-secret";
  assert.throws(() => S.unseal(sealed), "another key cannot open it");
  process.env.META_APP_SECRET = "test-app-secret";
});

await check("a connect link's state: signed, short-lived, refused when touched", () => {
  const state = S.signState({ uid: "user-1", p: "tiktok", clinic: "dungun" });
  eq([S.readState(state).uid, S.readState(state).clinic], ["user-1", "dungun"]);
  const [payload, sig] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "someone-else", p: "tiktok", clinic: "dungun", exp: 9999999999 })).toString("base64url");
  assert.equal(S.readState(`${forged}.${sig}`), null);
  assert.equal(S.readState(payload), null);
  assert.equal(S.readState(null), null);
  assert.equal(S.readState(S.signState({ uid: "user-1" }, -5)), null, "past its time");
});

/* ------------------------------ the inbox ------------------------------ */

const PAGE = { provider: "facebook", external_id: "PAGE1", clinic: "dungun", name: "Klinik Hijraa 24 Jam Dungun" };
const TT = { provider: "tiktok", external_id: "BIZ1", clinic: "dungun", name: "@klinikhijraadungun" };
const ev = (over) => ({ provider: "facebook", accountId: "PAGE1", userId: "U1", direction: "in", messageId: "m1", type: "text", body: "Hai", at: new Date().toISOString(), ...over });

await check("a first message makes the line, the contact, the thread and its tag — and asks the bot", async () => {
  const admin = fakeAdmin();
  let asked = 0;
  const trigger = await I.ingestSocialEvent(admin, PAGE, ev({}), async () => { asked++; return "Aminah Binti Ali"; });
  eq((admin.rows.whatsapp_numbers.map((r) => [r.phone_number_id, r.display_name, r.phone_display])), [["fb:dungun:PAGE1", "Facebook · Dungun", "Klinik Hijraa 24 Jam Dungun"]]);
  eq((admin.rows.contacts.map((r) => [r.wa_id, r.name, r.phone_number ?? null])), [["fb:U1", "Aminah Binti Ali", null]]);
  assert.equal(admin.rows.conversations.length, 1);
  eq((admin.rows.tags.map((t) => t.name)), ["facebook"]);
  eq((admin.rows.messages.map((m) => [m.wa_message_id, m.direction, m.status, m.body])), [["fb:m1", "inbound", "received", "Hai"]]);
  eq((trigger), { conversationId: admin.rows.conversations[0].id, waMessageId: "fb:m1" });

  // the same webhook again (Meta retries): nothing new, no second bot reply
  assert.equal(await I.ingestSocialEvent(admin, PAGE, ev({}), async () => { asked++; return "x"; }), null);
  // a second message: same thread, the name is not asked for again
  await I.ingestSocialEvent(admin, PAGE, ev({ messageId: "m2", body: "Pukul berapa buka?" }), async () => { asked++; return "x"; });
  eq([admin.rows.contacts.length, admin.rows.conversations.length, admin.rows.messages.length, admin.rows.conversation_tags.length, asked], [1, 1, 2, 1, 1]);
});

await check("no name from Facebook: the thread still has something to be called; TikTok gives its own", async () => {
  const admin = fakeAdmin();
  await I.ingestSocialEvent(admin, PAGE, ev({ userId: "1234567890abcd" }), async () => null);
  assert.equal(admin.rows.contacts[0].name, "Facebook ABCD");
  await I.ingestSocialEvent(admin, TT, ev({ provider: "tiktok", accountId: "BIZ1", userId: "CONV1", userName: "aminah88", messageId: "t1" }));
  eq((admin.rows.contacts.slice(1).map((r) => [r.wa_id, r.name])), [["tt:CONV1", "aminah88"]]);
  eq((admin.rows.whatsapp_numbers.map((r) => r.display_name)), ["Facebook · Dungun", "TikTok · Dungun"]);
  eq((admin.rows.tags.map((t) => t.name).sort()), ["facebook", "tiktok"]);
});

await check("staff answering from the Facebook / TikTok app: shown in the thread, and the bot steps back", async () => {
  const admin = fakeAdmin();
  await I.ingestSocialEvent(admin, TT, ev({ provider: "tiktok", accountId: "BIZ1", userId: "CONV1", userName: "aminah88", messageId: "t1" }));
  const conv = admin.rows.conversations[0];
  assert.equal(conv.bot_enabled, true);
  const r = await I.ingestSocialEvent(admin, TT, ev({ provider: "tiktok", accountId: "BIZ1", userId: "CONV1", direction: "out", messageId: "t2", body: "Baik Puan, kami semak." }));
  assert.equal(r, null, "the clinic's own message never asks the bot");
  eq((admin.rows.messages.map((m) => [m.direction, m.status, m.body])), [["inbound", "received", "Hai"], ["outbound", "sent", "Baik Puan, kami semak."]]);
  assert.equal(conv.bot_enabled, false);
});

await check("the CRM's own send coming back is not stored twice, and does not stop the bot", async () => {
  const admin = fakeAdmin();
  await I.ingestSocialEvent(admin, TT, ev({ provider: "tiktok", accountId: "BIZ1", userId: "CONV1", messageId: "t1" }));
  const conv = admin.rows.conversations[0];
  const now = new Date().toISOString();
  // the bot's reply, stored when TikTok accepted it
  admin.rows.messages.push({ id: "own-1", conversation_id: conv.id, wa_message_id: "tt:t9", direction: "outbound", type: "text", body: "Boleh, Puan. " + "Butiran. ".repeat(20) + "Terima kasih.", sent_by: null, sent_by_bot: true, created_at: now });
  admin.rows.messages.push({ id: "own-2", conversation_id: conv.id, wa_message_id: "tt:t10", direction: "outbound", type: "image", body: "📄 Pakej Sunat", sent_by: null, sent_by_bot: true, created_at: now });
  const echo = (over) => I.ingestSocialEvent(admin, TT, ev({ provider: "tiktok", accountId: "BIZ1", userId: "CONV1", direction: "out", at: now, ...over }));
  const before = admin.rows.messages.length;
  await echo({ messageId: "t9", body: "whatever" });                 // by its id
  await echo({ messageId: "t8", body: "Butiran. Butiran." });        // an earlier piece of the long reply
  await echo({ messageId: "t11", type: "image", body: "📷 Photo" }); // the poster
  await echo({ messageId: "t12", body: "Pakej Sunat" });             // the poster's caption, sent as its own message
  assert.equal(admin.rows.messages.length, before);
  assert.equal(conv.bot_enabled, true);
  // …but words nobody here sent are staff on the phone
  await echo({ messageId: "t13", body: "Saya telefon Puan sekejap lagi ya." });
  assert.equal(admin.rows.messages.length, before + 1);
  assert.equal(conv.bot_enabled, false);
});

await check("Meta's echo of our own send: stored once (a private reply lands in Messenger), never stops the bot", async () => {
  const admin = fakeAdmin();
  await I.ingestSocialEvent(admin, PAGE, ev({}), async () => "Aminah");
  const conv = admin.rows.conversations[0];
  // sent in this thread and stored under its id: the echo is the same message
  admin.rows.messages.push({ id: "own", conversation_id: conv.id, wa_message_id: "fb:mid-7", direction: "outbound", type: "text", body: "Boleh", sent_by: null, sent_by_bot: true, created_at: new Date().toISOString() });
  const before = admin.rows.messages.length;
  await I.ingestSocialEvent(admin, PAGE, ev({ direction: "out", own: true, messageId: "mid-7", body: "Boleh" }));
  assert.equal(admin.rows.messages.length, before);
  // a private reply to a comment, sent from the comments thread: shown in Messenger too
  await I.ingestSocialEvent(admin, PAGE, ev({ direction: "out", own: true, messageId: "mid-8", body: "Harga sunat RM250" }));
  eq(admin.rows.messages.slice(-1).map((m) => [m.wa_message_id, m.direction, m.body]), [["fb:mid-8", "outbound", "Harga sunat RM250"]]);
  assert.equal(conv.bot_enabled, true);
});

/* ---------------------------- post comments ---------------------------- */

const feed = (value) => ({ object: "page", entry: [{ id: "PAGE1", time: 1, changes: [{ field: "feed", value }] }] });
const comment = (over) => ({ item: "comment", verb: "add", comment_id: "PAGE1_9_c1", post_id: "PAGE1_9", parent_id: "PAGE1_9",
  message: "Berapa harga sunat?", created_time: 1794400000, from: { id: "CU1", name: "Siti Aminah" }, ...over });

await check("a comment under a post is read; edits, removals and the page's own replies are not", () => {
  const [e] = E.parseFacebookWebhook(feed(comment({})), APP);
  eq([e.provider, e.accountId, e.userId, e.userName, e.direction, e.messageId, e.postId, e.type, e.body],
    ["fbcomments", "PAGE1", "CU1", "Siti Aminah", "in", "PAGE1_9_c1", "PAGE1_9", "text", "Berapa harga sunat?"]);
  assert.equal(e.at, new Date(1794400000 * 1000).toISOString());
  eq(E.parseFacebookWebhook(feed(comment({ verb: "edited" })), APP), []);
  eq(E.parseFacebookWebhook(feed(comment({ verb: "remove" })), APP), []);
  eq(E.parseFacebookWebhook(feed(comment({ from: { id: "PAGE1", name: "Klinik" } })), APP), [], "the page answering");
  eq(E.parseFacebookWebhook(feed({ item: "reaction", verb: "add", from: { id: "CU1" } }), APP), []);
  const photo = E.parseFacebookWebhook(feed(comment({ message: "", photo: "https://cdn.example/x.jpg" })), APP)[0];
  eq([photo.type, photo.body, photo.mediaUrl], ["image", "📷 Photo", "https://cdn.example/x.jpg"]);
});

await check("which comments the bot answers: questions and the clinic's services, not tags or 'mantap'", () => {
  for (const yes of ["Berapa harga sunat?", "harga brp", "nak tanya pasal kurus", "PM", "Ada slot hari sabtu", "How much for the scan", "Buka pukul berapa", "info pakej pls"]) {
    assert.equal(L.isEnquiryComment(yes), true, yes);
  }
  for (const no of ["Mantap", "😍😍", "@Ali Abu", "@[123:Ali] tengok ni", "Amin", "Nice", "👍", "", null, "Terbaik doktor"]) {
    assert.equal(L.isEnquiryComment(no), false, String(no));
  }
});

await check("a comment lands on the page's Comments line, with a link to its post; the bot only for a question", async () => {
  const admin = fakeAdmin();
  const [q] = E.parseFacebookWebhook(feed(comment({})), APP);
  const t1 = await I.ingestSocialEvent(admin, PAGE, q);
  eq(admin.rows.whatsapp_numbers.map((r) => [r.phone_number_id, r.display_name]), [["fbc:dungun:PAGE1", "Facebook Comments · Dungun"]]);
  eq(admin.rows.contacts.map((r) => [r.wa_id, r.name]), [["fbc:CU1", "Siti Aminah"]]);
  eq(admin.rows.tags.map((t) => t.name), ["facebook-comment"]);
  eq(admin.rows.messages.map((m) => [m.wa_message_id, m.body]), [["fbc:PAGE1_9_c1", "Berapa harga sunat?\n\n🔗 Post: https://www.facebook.com/PAGE1_9"]]);
  eq(t1, { conversationId: admin.rows.conversations[0].id, waMessageId: "fbc:PAGE1_9_c1" });
  // the same person says "mantap" on another post: same thread, stored, no bot
  const [m] = E.parseFacebookWebhook(feed(comment({ comment_id: "PAGE1_10_c2", post_id: "PAGE1_10", message: "Mantap" })), APP);
  assert.equal(await I.ingestSocialEvent(admin, PAGE, m), null);
  eq([admin.rows.conversations.length, admin.rows.messages.length], [1, 2]);
  // Messenger and comments from one page are two lines
  await I.ingestSocialEvent(admin, PAGE, ev({}), async () => "Siti");
  eq(admin.rows.whatsapp_numbers.map((r) => r.display_name), ["Facebook Comments · Dungun", "Facebook · Dungun"]);
});

await check("Facebook/TikTok replies drop the 'Saya Hana, pembantu AI' introduction, never the answer", () => {
  const cases = [
    ["Saya Hana, pembantu AI Klinik Hijraa. Harga sunat RM250 untuk kanak-kanak.", "Harga sunat RM250 untuk kanak-kanak."],
    ["Hai! Saya Hana, pembantu AI Klinik Hijraa 😊 Klinik buka 24 jam.", "Klinik buka 24 jam."],
    ["Assalamualaikum Puan, saya Hana, pembantu AI di sini. Boleh, slot Sabtu ada.", "Boleh, slot Sabtu ada."],
    ["Terima kasih atas soalan. Saya Hana pembantu AI. Harga RM50.", "Terima kasih atas soalan. Harga RM50."],
    ["Hana, pembantu AI Klinik Hijraa di sini.\nHarga RM100.", "Harga RM100."],
    ["Harga sunat RM250. Klinik buka 24 jam.", "Harga sunat RM250. Klinik buka 24 jam."],
    ["Pakej Hana Sihat RM99.", "Pakej Hana Sihat RM99."],
  ];
  for (const [inp, want] of cases) assert.equal(L.stripIntro(inp).trim(), want, inp);
  assert.equal(L.stripIntro("Saya Hana, pembantu AI Klinik Hijraa."), "Saya Hana, pembantu AI Klinik Hijraa.", "an introduction alone is never sent as nothing");
  assert.match(L.socialChatNote("fb:dungun:P1"), /Do NOT introduce yourself/);
  assert.match(L.socialChatNote("fbc:dungun:P1"), /Do NOT introduce yourself/);
  assert.match(L.socialChatNote("fbc:dungun:P1"), /like a person/);
  assert.match(L.socialChatNote("tt:dungun:A1"), /like a person/);
});

await check("Facebook/TikTok replies send people on to the branch's WhatsApp", () => {
  // the channel notes ask for it, with that branch's number and link
  assert.match(L.socialChatNote("fb:dungun:P1"), /WhatsApp 013-923 7548, link https:\/\/wa\.me\/60139237548/);
  assert.match(L.socialChatNote("fbc:paka:P2"), /WhatsApp 018-592 5343, link https:\/\/wa\.me\/60185925343/);
  assert.match(L.socialChatNote("tt:paka:A1"), /End EVERY reply by inviting them to continue on WhatsApp/);
  assert.doesNotMatch(L.socialChatNote("fb:dungun:P1"), /ask for a contact phone number/);
  // a reply without a link gets the branch's; one with a link is left alone
  assert.equal(L.withWhatsappLink("Harga RM50.", "dungun"),
    "Harga RM50.\n\nUntuk pertanyaan lanjut atau tempahan, WhatsApp kami di 013-923 7548: https://wa.me/60139237548");
  assert.match(L.withWhatsappLink("Harga RM50.", "paka"), /wa\.me\/60185925343$/);
  const has = "Boleh WhatsApp Paka di https://wa.me/60185925343 ya.";
  assert.equal(L.withWhatsappLink(has, "dungun"), has);
});

/* --------------------------- Google reviews --------------------------- */

const LOC = "accounts/111/locations/222";
const NOW = Date.parse("2026-11-12T10:00:00Z");
const review = (over) => ({ reviewId: "R1", reviewer: { displayName: "Siti Aminah" }, starRating: "FIVE", comment: "Doktor baik, tak lama tunggu",
  createTime: "2026-11-12T08:00:00Z", updateTime: "2026-11-12T08:00:00Z", ...over });

await check("a Google review line: its id carries the clinic and the profile path; no reply window", () => {
  const line = L.socialLineOf(`gr:paka:${LOC}`);
  eq(line, { provider: "greviews", account: "google", clinic: "paka", externalId: LOC, branch: "Paka", clinicName: "Klinik Hijraa 24 Jam Paka" });
  assert.equal(L.providerOf("gr:R1"), "greviews");
  assert.equal(L.lineName("greviews", "dungun"), "Google Reviews · Dungun");
  assert.equal(L.socialWindowOpen("greviews", "2020-01-01T00:00:00Z", NOW), true, "a review can be answered years later");
});

await check("a review reads as its stars, then its words; the stars read back out", () => {
  assert.equal(L.starCount("FOUR"), 4);
  assert.equal(L.starCount("STAR_RATING_UNSPECIFIED"), null);
  assert.equal(L.reviewMessage(5, " Bagus "), "⭐⭐⭐⭐⭐ 5/5\n\nBagus");
  assert.equal(L.reviewMessage(2, ""), "⭐⭐ 2/5\n\n(stars only — no written review)");
  assert.equal(L.reviewStars(L.reviewMessage(3, "Lama tunggu")), 3);
  assert.equal(L.reviewStars("Hai, nak tanya harga"), null);
});

await check("Google reviews: a new unanswered one may go to the bot; an answered or old one may not", () => {
  const fresh = E.googleReviewEvents(LOC, review({}), NOW);
  eq(fresh.map((e) => [e.provider, e.userId, e.userName, e.direction, e.messageId, !!e.botMay]), [["greviews", "R1", "Siti Aminah", "in", "R1", true]]);
  assert.match(fresh[0].body, /^⭐⭐⭐⭐⭐ 5\/5\n\nDoktor baik/u);
  const answered = E.googleReviewEvents(LOC, review({ reviewReply: { comment: "Terima kasih!", updateTime: "2026-11-12T09:00:00Z" } }), NOW);
  eq(answered.map((e) => [e.direction, e.messageId, !!e.own, !!e.botMay]), [["in", "R1", false, false], ["out", "re:R1", true, false]]);
  const week = E.googleReviewEvents(LOC, review({ createTime: "2026-11-01T08:00:00Z" }), NOW);
  assert.equal(week[0].botMay, false, "older than 3 days: staff, not the bot");
  eq(E.googleReviewEvents(LOC, review({ createTime: "2026-01-01T08:00:00Z" }), NOW), [], "older than 180 days: not brought in at all");
  assert.equal(E.googleReviewEvents(LOC, review({ reviewer: { isAnonymous: true, displayName: "x" } }), NOW)[0].userName, "Google user");
});

await check("a review lands on its profile's line, its reply beside it, and only a new one asks the bot", async () => {
  const admin = fakeAdmin();
  const GP = { provider: "google", external_id: LOC, clinic: "dungun", name: "Klinik Hijraa 24 Jam Dungun" };
  const [newOne] = E.googleReviewEvents(LOC, review({}), NOW);
  const t = await I.ingestSocialEvent(admin, GP, newOne);
  assert.ok(t, "a new review asks the bot");
  eq(admin.rows.whatsapp_numbers.map((r) => [r.phone_number_id, r.display_name]), [[`gr:dungun:${LOC}`, "Google Reviews · Dungun"]]);
  eq(admin.rows.contacts.map((r) => [r.wa_id, r.name]), [["gr:R1", "Siti Aminah"]]);
  eq(admin.rows.tags.map((x) => x.name), ["google-review"]);
  assert.equal(await I.ingestSocialEvent(admin, GP, newOne), null, "the next sync finds it already here");
  const [old, reply] = E.googleReviewEvents(LOC, review({ reviewId: "R2", reviewReply: { comment: "Terima kasih" } }), NOW);
  assert.equal(await I.ingestSocialEvent(admin, GP, old), null, "answered already: not for the bot");
  assert.equal(await I.ingestSocialEvent(admin, GP, reply), null);
  const conv2 = admin.rows.messages.find((m) => m.wa_message_id === "gr:R2").conversation_id;
  eq(admin.rows.messages.filter((m) => m.conversation_id === conv2).map((m) => [m.wa_message_id, m.direction]), [["gr:R2", "inbound"], ["gr:re:R2", "outbound"]]);
  assert.equal(admin.rows.conversations.find((c) => c.id === conv2).bot_enabled, true, "a reply found on Google never takes the thread from the bot");
});

await check("Hana's note for a review: public, private about health, WhatsApp only for a complaint", () => {
  const note = L.socialChatNote(`gr:dungun:${LOC}`);
  assert.match(note, /GOOGLE REVIEW/);
  assert.match(note, /NEVER confirm or suggest that the reviewer is or was a patient/);
  assert.match(note, /never name a doctor/);
  assert.match(note, /1–3 stars:.*WhatsApp 013-923 7548, https:\/\/wa\.me\/60139237548/);
  assert.match(note, /4–5 stars:.*No phone number or link/);
  assert.match(note, /Do NOT introduce yourself/);
  assert.equal(L.REVIEW_AUTO_REPLY_MIN_STARS, 4);
});

console.log(`\nsocial channels: ${n} checks passed`);
