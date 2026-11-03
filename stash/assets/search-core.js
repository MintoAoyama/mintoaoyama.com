// Matching for the search page, apart from the DOM so that the tests can run it.

const KATAKANA = /[ァ-ヶ]/g;
const SOUND_MARKS = ['゙', '゚'];

// Folds what a reader takes for the same letters: full and half width (NFKC), case, and katakana into hiragana.
// starts[i] and ends[i] are the span of the text that folded[i] came from, so that a match is marked on the text itself.
export function fold(text) {
  let folded = '';
  const starts = [];
  const ends = [];
  let i = 0;
  for (const ch of text) {
    const end = i + ch.length;
    const f = ch.normalize('NFKC').toLowerCase().replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    // A half-width sound mark (ﾞ ﾟ) is a letter of its own until it is joined to the one before it.
    const joined = SOUND_MARKS.includes(f) && folded ? (folded.slice(-1) + f).normalize('NFC') : '';
    if (joined.length === 1) {
      folded = folded.slice(0, -1) + joined;
      ends[ends.length - 1] = end;
    } else {
      for (let k = 0; k < f.length; k++) {
        starts.push(i);
        ends.push(end);
      }
      folded += f;
    }
    i = end;
  }
  return { folded, starts, ends };
}

// Words split by spaces, all of which have to be found.
export function queryTerms(query) {
  return [...new Set(fold(query).folded.split(/\s+/).filter(Boolean))];
}

const workText = (w) => [w.title, w.meta, ...w.tags.map((t) => `#${t}`)].join('\n');
const logText = (l) => [l.heading, l.program, l.author, l.text].join('\n');

// data/search.json folded once, as every query goes over all of it.
export function prepare(data) {
  return data.works.map((work) => ({
    work,
    text: fold(workText(work)).folded,
    logs: work.logs.map((log) => ({ log, text: fold(logText(log)).folded })),
  }));
}

// Works whose own fields have every term, and logs that have every term together with their work's fields.
// A log has to have one of the terms itself: when the work alone matches, its logs say nothing more.
export function search(prepared, query) {
  const terms = queryTerms(query);
  const works = [];
  const logs = [];
  if (terms.length === 0) return { terms, works, logs };
  for (const p of prepared) {
    if (terms.every((t) => p.text.includes(t))) works.push(p.work);
    for (const l of p.logs) {
      if (terms.some((t) => l.text.includes(t)) && terms.every((t) => l.text.includes(t) || p.text.includes(t))) {
        logs.push({ work: p.work, log: l.log });
      }
    }
  }
  logs.sort((a, b) => b.log.date.localeCompare(a.log.date) || a.work.id.localeCompare(b.work.id) || a.log.id.localeCompare(b.log.id));
  return { terms, works, logs };
}

// Where the terms are in the text, as [start, end) spans of the text, in order and merged where they touch.
export function marks(text, terms) {
  const { folded, starts, ends } = fold(text);
  const spans = [];
  for (const t of terms) {
    for (let at = folded.indexOf(t); at >= 0; at = folded.indexOf(t, at + 1)) spans.push([starts[at], ends[at + t.length - 1]]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return merged;
}

// The text from `from` to `to` as runs that are marked or not.
export function segments(text, spans, from = 0, to = text.length) {
  const out = [];
  let at = from;
  for (const [s, e] of spans) {
    if (e <= from || s >= to) continue;
    if (s > at) out.push({ text: text.slice(at, s), mark: false });
    out.push({ text: text.slice(Math.max(s, at), Math.min(e, to)), mark: true });
    at = Math.min(e, to);
  }
  if (at < to) out.push({ text: text.slice(at, to), mark: false });
  return out;
}

const isLowSurrogate = (text, i) => /[\udc00-\udfff]/.test(text.charAt(i));

// A part of the text around the first term found in it (or its start), on one line: the line it is in starts it
// when that is close enough. head and tail tell whether text was left out before and after.
export function snippet(text, terms, { before = 30, length = 120 } = {}) {
  const flat = text.replace(/\s/g, ' ');
  const spans = marks(flat, terms);
  const first = spans[0]?.[0] ?? 0;
  const lineStart = text.lastIndexOf('\n', first - 1) + 1;
  let from = first - lineStart <= before ? lineStart : first - before;
  if (isLowSurrogate(flat, from)) from--;
  let to = Math.min(flat.length, from + length);
  if (isLowSurrogate(flat, to)) to++;
  return { segments: segments(flat, spans, from, to), head: from > 0, tail: to < flat.length };
}

// The recent queries with this one first, the same query only once, and at most `limit` of them.
export function rememberQuery(history, query, limit = 10) {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return history;
  return [q, ...history.filter((h) => h !== q)].slice(0, limit);
}

// The recent queries offered under the box: those with what has been typed in them, other than that itself.
export function suggestions(history, typed) {
  const t = fold(typed.trim()).folded;
  return history.filter((h) => {
    const f = fold(h).folded;
    return f !== t && f.includes(t);
  });
}
