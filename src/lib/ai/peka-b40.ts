/** Identify the free-screening topic, including short follow-up questions. */
export function isPekaB40Enquiry(history: readonly { role: string; content: unknown }[]): boolean {
  const textOf = (content: unknown): string => typeof content === 'string' ? content :
    Array.isArray(content) ? content.filter(b => b?.type === 'text').map(b => b.text).join(' ') : '';
  const users = history.filter(m => m.role === 'user');
  const asked = textOf(users.at(-1)?.content);
  if (/pakej\s*berbayar|paid\s*(package|check)|\b(basic|essential|premium)\b/i.test(asked)) return false;
  const freeScreening = /\bpeka\s*b\s*40\b|\bb\s*40\b|(?:free|percuma).*(?:check|saringan|pemeriksaan)|(?:check|saringan|pemeriksaan).*(?:free|percuma)/i;
  return history.slice(-6).some(m => freeScreening.test(textOf(m.content)));
}
