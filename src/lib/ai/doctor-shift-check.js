// Kept byte-identical with team-crm/src/lib/ai/doctor-shift-check.js.
// Supplements the existing doctor-name/date guard with shift CLOCK checks.
const shortName = d => String(d?.name || '').replace(/^dr\.?\s+/i, '').trim().toLowerCase();
const minuteOf = t => /^\d\d:\d\d$/.test(String(t || '')) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;
const CLOCK = '(\\d{1,2})(?:[:.]([0-5]\\d))?\\s*(a\\.?m\\.?|p\\.?m\\.?|tengah\\s*hari|pagi|petang|ptg|malam|mlm)?';
const RANGE = new RegExp('\\b' + CLOCK + '\\s*(?:hingga|sehingga|sampai|to|[–—-])\\s*' + CLOCK + '\\b', 'gi');
function clockOptions(h, m, part) {
  const hour = Number(h), minutes = Number(m || 0), p = String(part || '').toLowerCase().replace(/[.\s]/g, '');
  if (hour > 23) return [];
  if (p) {
    if (hour > 12) return [];
    const base = hour % 12;
    const pm = /^(pm|petang|ptg|tengahhari)$/.test(p) || (/^(malam|mlm)$/.test(p) && hour >= 6 && hour !== 12);
    return [(base + (pm ? 12 : 0)) * 60 + minutes];
  }
  if (hour > 12 || /^0\d/.test(h) || hour === 0) return [hour * 60 + minutes];
  return [...new Set([(hour % 12) * 60 + minutes, (hour % 12 + 12) * 60 + minutes])];
}
const contains = (from, to, time) => from === to || (from < to ? time >= from && time < to : time >= from || time < to);
function pairsFor(shifts, doc) {
  const pairs = shifts.filter(s => !doc || s.doctors.some(d => shortName(d) === doc))
    .map(s => [minuteOf(s.from), minuteOf(s.to)]).filter(p => p[0] != null && p[1] != null);
  if (!doc) return pairs; // different doctors covering a clinic are not one shift
  // One doctor can work consecutive evening/night shifts: 17–22 + 22–08
  // legitimately reads 17–08, not an invented 13-hour shift.
  for (let pass = 0; pass < 2; pass++) {
    for (const a of pairs.slice()) for (const b of pairs.slice()) {
      if (a[1] === b[0] && a[0] !== b[1] && !pairs.some(p => p[0] === a[0] && p[1] === b[1])) pairs.push([a[0], b[1]]);
    }
  }
  return pairs;
}

/** Functions supplied by the existing date guard keep branch/day semantics identical. */
function offShift(body, scope, patientTexts, reply, daysNamed, askedDays) {
  const everyone = new Set();
  for (const day of body.days || []) for (const b of day.branches || []) {
    for (const s of [...b.shifts, ...b.extras]) for (const d of s.doctors) everyone.add(shortName(d));
    for (const d of b.now || []) everyone.add(shortName(d));
  }
  let days = askedDays(body, patientTexts.at(-1) || '', patientTexts.slice(0, -1));
  let branches = scope, headingDocs = [];
  const wrong = new Set(), now = minuteOf(body.now);
  const asksNow = /\b(sekarang|skrg|now|currently|at the moment)\b/i.test(patientTexts.at(-1) || '');
  for (const seg of String(reply || '').split(/\n+|(?<=[!?])\s+|(?<=[.])\s+(?!\d)/)) {
    const namedDays = daysNamed(body, seg);
    if (namedDays) days = namedDays;
    const namedBranches = scope.filter(n => new RegExp('\\b' + n + '\\b', 'i').test(seg));
    if (namedBranches.length) branches = namedBranches;
    // A negative statement is not a claim that this doctor works this shift.
    if (/\b(tidak|tak|bukan|not|isn't|off|cuti)\b/i.test(seg)) { headingDocs = []; continue; }
    const docs = [...everyone].filter(n => n && new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(seg));
    const ranges = [...seg.matchAll(RANGE)];
    if (!ranges.length && docs.length && /:\s*$/.test(seg)) headingDocs = docs;
    const usedDocs = docs.length ? docs : headingDocs;
    const currentClaim = days.includes(0) && !days.some(i => i !== 0)
      && (/\b(sekarang|skrg|now|currently|at the moment)\b/i.test(seg) || asksNow);
    const relevant = days.flatMap(i => (body.days[i]?.branches || []).filter(b => branches.includes(b.name)));
    if (currentClaim && now != null) for (const doc of usedDocs) {
      if (relevant.length && !relevant.some(b => (b.now || []).some(d => shortName(d) === doc))) wrong.add(doc + ' (not on duty now)');
    }
    for (const match of ranges) {
      const starts = clockOptions(match[1], match[2], match[3]), ends = clockOptions(match[4], match[5], match[6]);
      if (!starts.length || !ends.length) continue;
      for (const doc of usedDocs.length ? usedDocs : [null]) {
        let groups = relevant.map(b => b.shifts || []);
        // Yesterday's overnight shift also covers the following morning.
        for (const i of days) if (i > 0) for (const b of body.days[i - 1]?.branches || []) {
          if (branches.includes(b.name)) groups.push(b.shifts.filter(s => s.to <= s.from));
        }
        const pairs = groups.flatMap(shifts => pairsFor(shifts, doc));
        // At the start of the rota, NOW can name last night's doctor without
        // publishing that older shift's times. Do not invent a contradiction.
        if (doc && now != null && now < 480 && days.includes(0)
          && relevant.some(b => (b.now || []).some(d => shortName(d) === doc)) && !pairs.length) continue;
        if (!pairs.length) continue; // names/date guard handles missing doctors
        const exactShift = /bertugas|syif|\bshift\b|on duty|working|\bworks\b|\bkerja\b/i.test(seg);
        const valid = starts.some(from => ends.some(to => pairs.some(p =>
          (p[0] === from && p[1] === to || !exactShift && contains(p[0], p[1], from) && contains(p[0], p[1], (to + 1439) % 1440))
          && (!currentClaim || now == null || contains(from, to, now)))));
        if (!valid) wrong.add((doc || 'doctor') + ' (shift time ' + match[0].trim() + ')');
      }
    }
  }
  return [...wrong];
}
module.exports = { offShift };
