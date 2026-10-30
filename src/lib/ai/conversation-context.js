// Kept byte-identical with team-crm/src/lib/ai/conversation-context.js.
// No network, database, provider or host-timezone dependency.
const DAY_MS = 86400000;
const MYT_OFFSET_MS = 8 * 3600000;
const CONVERSATION_GAP_MS = 8 * 3600000;
const REFERENCES_OLD_CHAT = /\b(hari tu|tempoh hari|minggu lepas|semalam|sebelum ni|sebelum ini|sambung|susulan|follow[ -]?up|last time|yesterday|previous(?:ly)?|earlier|as discussed|same (?:appointment|booking|problem))\b/i;

function messageTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? (value < 1e12 ? value * 1000 : value) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  // A bare SQL timestamp is UTC in the CRM, never the laptop/server timezone.
  const text = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(value) && !/(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(value)
    ? value.replace(' ', 'T') + 'Z' : value;
  const ms = Date.parse(text);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
const messageText = content => typeof content === 'string' ? content
  : (Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text || '').join('\n') : '');
const mytDay = ms => Math.floor((ms + MYT_OFFSET_MS) / DAY_MS);
function dateOf(ms) {
  const iso = new Date(ms + MYT_OFFSET_MS).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function formatMessageTime(ms) {
  return `${dateOf(ms)} ${new Date(ms + MYT_OFFSET_MS).toISOString().slice(11, 16)} MYT`;
}
// Only for intent/date guards, not a rewrite of the patient's model-visible words.
function rebaseRelativeDates(text, sentAt, now) {
  if (sentAt == null || mytDay(sentAt) === mytDay(now)) return text;
  return String(text).replace(/\b(day after tomorrow|lusa|tomorrow|esok|esk|besok|bsk|yesterday|semalam|hari ini|hari ni|harini|today|tonight|sekarang|skrg|now|(?:malam|mlm|pagi|petang|ptg)\s+(?:ni|ini))\b/gi, word => {
    const w = word.toLowerCase();
    const offset = /^(lusa|day after tomorrow)$/.test(w) ? 2
      : /^(tomorrow|esok|esk|besok|bsk)$/.test(w) ? 1
      : /^(semalam|yesterday)$/.test(w) ? -1 : 0;
    const part = /^(tonight|malam|mlm)/.test(w) ? ' malam' : /^pagi/.test(w) ? ' pagi' : /^(petang|ptg)/.test(w) ? ' petang' : '';
    return dateOf(sentAt + offset * DAY_MS) + part;
  });
}

/**
 * @param {Array<{role: string, content: *, sentAt?: number|string}>} turns oldest first
 * @param {number} [now]
 */
function buildConversationContext(turns, now = Date.now()) {
  const source = (turns || []).filter(m => m && (m.role === 'user' || m.role === 'assistant'));
  const times = source.map(m => messageTime(m.sentAt));
  const latestUser = source.findLastIndex(m => m.role === 'user');
  const anchor = latestUser >= 0 ? times[latestUser] : null;
  let start = 0;
  if (anchor != null) {
    let next = anchor;
    for (let i = latestUser - 1; i >= 0; i--) {
      if (times[i] == null || next - times[i] >= CONVERSATION_GAP_MS) { start = i + 1; break; }
      next = times[i];
    }
  }
  // An orphaned assistant reply is not the start of the current enquiry.
  while (start < source.length && source[start].role !== 'user') start++;
  const active = source.slice(start);
  const explicitFollowup = active.some(m => m.role === 'user' && REFERENCES_OLD_CHAT.test(messageText(m.content)));
  const first = explicitFollowup ? 0 : start;
  const messages = [];
  for (let i = first; i < source.length; i++) {
    const m = source[i], at = times[i];
    const stamp = at == null ? '[Message date unavailable]' : `[Message sent ${formatMessageTime(at)}${i < start ? ' — OLDER CONVERSATION, background only' : ''}]`;
    const content = at == null && anchor == null ? m.content
      : typeof m.content === 'string' ? `${stamp}\n${m.content}`
      : [{ type: 'text', text: stamp }, ...m.content.map(b => ({ ...b }))];
    const previous = messages[messages.length - 1];
    if (previous?.role === m.role) {
      if (typeof previous.content === 'string' && typeof content === 'string') previous.content += '\n\n' + content;
      else previous.content = [...(typeof previous.content === 'string' ? [{ type: 'text', text: previous.content }] : previous.content),
        ...(typeof content === 'string' ? [{ type: 'text', text: content }] : content)];
    } else messages.push({ role: m.role, content });
  }
  const activeHistory = active.map(m => ({ role: m.role, content: rebaseRelativeDates(messageText(m.content), messageTime(m.sentAt), now) }));
  const note = anchor == null ? '' :
    `MESSAGE DATE CONTEXT: Each message is labelled with its actual Malaysia date/time. Current patient message: ${formatMessageTime(anchor)}. Current time: ${formatMessageTime(now)}. ` +
    (start ? `A quiet gap of at least 8 hours (or an unknown older date) starts a new enquiry. ${explicitFollowup ? 'Older dated messages are included ONLY as background because the patient explicitly referred back.' : 'Unrelated older exchanges have been left out.'} ` : '') +
    `Interpret today/tomorrow/tonight/yesterday relative to the date of the message containing those words, never as though every message was sent today. ` +
    `Answer the latest enquiry. Do not revive an old topic or apologise for an old AI mistake unless relevant to what the patient asks now. ` +
    `An earlier AI reply is NOT evidence that the patient confirmed something. Never assume today's fasting, symptoms, arrival plan, availability or doctor duty from an old message or an earlier assistant claim; reconfirm a time-sensitive fact only when needed. ` +
    `Doctor names and shift start/end times must come from the live CMS for the requested date and branch, not chat history. Do not volunteer a doctor or correct an old shift time during an unrelated enquiry.`;
  return { messages, activeHistory, note, omitted: explicitFollowup ? 0 : start };
}

module.exports = { buildConversationContext, formatMessageTime, rebaseRelativeDates };
