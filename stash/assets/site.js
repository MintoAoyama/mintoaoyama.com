// Fills the parts of pages that depend on the whole data set (data/site.json).
const base = document.querySelector('meta[name="stash-base"]')?.content ?? '/';

const el = (tag, attrs = {}, text) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

// Same shard rule as workShard in src/pages.ts.
const workLink = (id, title) => el('a', { href: `${base}w/${encodeURIComponent(id.slice(-1))}/${encodeURIComponent(id)}/` }, title);

function fillStats(data) {
  for (const node of document.querySelectorAll('[data-stat]')) {
    const value = data.counts[node.dataset.stat];
    if (value !== undefined) node.textContent = String(value);
  }
}

function fillRecent(data) {
  const list = document.querySelector('.recent .timeline');
  if (!list) return;
  for (const r of data.recent) {
    const li = el('li');
    li.append(el('time', { datetime: r.loggedAt }, r.loggedAt), ' ', workLink(r.id, r.title), ' ', el('span', { class: 'author' }, r.author));
    if (r.rating) li.append(' ', el('span', { class: 'rating' }, '★'.repeat(r.rating)));
    list.append(li);
  }
}

function fillYears(data) {
  const list = document.querySelector('.years .months');
  if (!list) return;
  for (const y of data.years) {
    const li = el('li');
    li.append(el('a', { href: `${base}m/${y.year}/` }, `${y.year}年`), ' ', el('span', { class: 'count' }, String(y.logs)));
    list.append(li);
  }
}

function fillOnThisDay(data) {
  const section = document.querySelector('.on-this-day');
  if (!section) return;
  const now = new Date();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entries = (data.days[today] ?? []).filter((d) => d.year !== String(now.getFullYear()));
  if (entries.length === 0) return;
  const list = section.querySelector('ul');
  for (const d of entries) {
    const li = el('li');
    li.append(`${now.getFullYear() - Number(d.year)}年前 `, workLink(d.id, d.title));
    list.append(li);
  }
  section.hidden = false;
}

try {
  const res = await fetch(`${base}data/site.json`);
  if (res.ok) {
    const data = await res.json();
    fillStats(data);
    fillRecent(data);
    fillYears(data);
    fillOnThisDay(data);
  }
} catch (e) {
  console.warn('site.json could not be loaded', e);
}
