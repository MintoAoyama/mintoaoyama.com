// The search page: matches data/search.json in the browser and keeps the query in the URL (?q=).
import { marks, prepare, queryTerms, search, segments, snippet } from './search-core.js';
import { attachHistory, keepQuery } from './search-history.js';

const base = document.querySelector('meta[name="stash-base"]')?.content ?? '/';
const LOG_LIMIT = 100;

const el = (tag, attrs = {}, text) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

// Same shard rule as workShard in src/pages.ts.
const workHref = (id) => `${base}w/${encodeURIComponent(id.slice(-1))}/${encodeURIComponent(id)}/`;

function appendRuns(node, runs) {
  for (const r of runs) node.append(r.mark ? el('mark', {}, r.text) : r.text);
  return node;
}

const marked = (tag, attrs, text, terms) => appendRuns(el(tag, attrs), segments(text, marks(text, terms)));

function stars(rating) {
  if (!rating) return '';
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return el('span', { class: 'rating', 'aria-label': `評価 ${r} / 5` }, '★'.repeat(r) + '☆'.repeat(5 - r));
}

function workCard(w, terms) {
  const li = el('li', { class: 'card card--text' });
  const a = el('a', { href: workHref(w.id) });
  a.append(marked('span', { class: 'card-title' }, w.title, terms));
  const meta = marked('span', { class: 'card-meta' }, w.meta, terms);
  if (w.date) meta.append(' · ', el('time', { datetime: w.date }, w.date));
  const tags = w.tags.filter((t) => marks(`#${t}`, terms).length > 0);
  if (tags.length) meta.append(' · ', ...tags.flatMap((t, i) => [i ? ' ' : '', marked('span', {}, `#${t}`, terms)]));
  li.append(a, meta);
  return li;
}

function logItem({ work, log }, terms) {
  const li = el('li', { class: 'search-log' });
  const a = el('a', { class: 'search-log-title', href: `${workHref(work.id)}${encodeURIComponent(log.id)}/` });
  a.append(marked('span', { class: 'search-log-work' }, work.title, terms));
  if (log.heading) a.append(' ', marked('span', { class: 'search-log-heading' }, log.heading, terms));
  const meta = el('div', { class: 'card-meta' });
  meta.append(el('time', { datetime: log.date }, log.date));
  if (log.program) meta.append(' · ', marked('span', {}, `「${log.program}」`, terms));
  meta.append(el('span', { class: 'author' }, ` · ${log.author}`), ' ', stars(log.rating));
  li.append(a, meta);
  if (log.text) {
    const s = snippet(log.text, terms);
    const p = el('p', { class: 'search-snippet' });
    if (s.head) p.append('…');
    appendRuns(p, s.segments);
    if (s.tail) p.append('…');
    li.append(p);
  }
  return li;
}

function section(title, count, list) {
  const node = el('section', { class: 'search-section' });
  const h2 = el('h2', {}, `${title} `);
  h2.append(el('span', { class: 'count' }, String(count)));
  node.append(h2, list);
  return node;
}

const form = document.querySelector('.search-form');
const input = form?.querySelector('input[name="q"]');
const status = document.querySelector('.search-status');
const results = document.querySelector('.search-results');
const pageTitle = document.title;
let prepared = null;

function show(query) {
  results.replaceChildren();
  document.title = query.trim() ? `「${query.trim()}」 | ${pageTitle}` : pageTitle;
  if (queryTerms(query).length === 0) {
    status.textContent = '';
    return;
  }
  if (!prepared) return;
  const { terms, works, logs } = search(prepared, query);
  if (works.length === 0 && logs.length === 0) {
    status.textContent = '見つかりませんでした';
    return;
  }
  status.textContent = `作品 ${works.length} 件 · 記録 ${logs.length} 件`;
  if (works.length) {
    const list = el('ul', { class: 'cards cards--text' });
    list.append(...works.map((w) => workCard(w, terms)));
    results.append(section('作品', works.length, list));
  }
  if (logs.length) {
    const list = el('ol', { class: 'search-logs' });
    list.append(...logs.slice(0, LOG_LIMIT).map((l) => logItem(l, terms)));
    const node = section('記録', logs.length, list);
    if (logs.length > LOG_LIMIT) node.append(el('p', { class: 'count' }, `新しい順に ${LOG_LIMIT} 件まで出しています。語を足すと絞り込めます`));
    results.append(node);
  }
}

// Typing replaces the entry in the history instead of adding one per letter.
function remember(query) {
  const url = new URL(location.href);
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

if (form && input && status && results) {
  input.value = new URLSearchParams(location.search).get('q') ?? '';
  // A query is kept when it was searched for on purpose (Enter, a result opened, or the page opened with it),
  // not on every letter typed. attachHistory keeps the ones submitted.
  keepQuery(input.value);
  attachHistory(input);
  results.addEventListener('click', (e) => {
    if (e.target.closest('a')) keepQuery(input.value);
  });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      remember(input.value);
      show(input.value);
    }, 150);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    remember(input.value);
    show(input.value);
    // The page stays, so the on-screen keyboard would stay over the results.
    if (matchMedia('(pointer: coarse)').matches) input.blur();
  });
  show(input.value);
  try {
    const res = await fetch(`${base}data/search.json`);
    if (!res.ok) throw new Error(`${res.status}`);
    prepared = prepare(await res.json());
    show(input.value);
  } catch (e) {
    status.textContent = '検索の準備ができませんでした';
    console.warn('search.json could not be loaded', e);
  }
}
