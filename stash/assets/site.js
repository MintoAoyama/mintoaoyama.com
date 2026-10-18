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

// The links are hidden in the HTML so that no page depends on what exists elsewhere.
function showNav(data) {
  for (const link of document.querySelectorAll('[data-nav-type]')) link.hidden = !data.counts.byType[link.dataset.navType];
  for (const link of document.querySelectorAll('[data-nav-seasons]')) link.hidden = !data.counts.seasons;
}

// Author names are hidden in the HTML until a second author has written.
function showAuthors(data) {
  if (data.counts.authors > 1) document.documentElement.dataset.authors = 'many';
}

function fillStats(data) {
  for (const node of document.querySelectorAll('[data-stat]')) {
    const value = data.counts[node.dataset.stat];
    if (value !== undefined) node.textContent = String(value);
  }
}

const SEASONS = [['winter', '冬'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋']];

// The season of the day the page is opened, like the schema's: winter is January to March.
function fillThisSeason(data) {
  const section = document.querySelector('.this-season');
  if (!section) return;
  const now = new Date();
  const [name, label] = SEASONS[Math.floor(now.getMonth() / 3)];
  const season = `${now.getFullYear()}-${name}`;
  const works = data.seasonWorks[season] ?? [];
  if (works.length === 0) return;
  const link = section.querySelector('.season-link');
  link.href = `${base}s/${season}/`;
  link.textContent = `${now.getFullYear()}${label}`;
  const list = section.querySelector('ul');
  for (const w of works) {
    const progress = w.episode === null ? '' : w.episodeCount ? `第${w.episode}話まで / ${w.episodeCount}` : `第${w.episode}話まで`;
    const meta = [w.channel, progress, w.loggedAt].filter(Boolean).join(' · ');
    const li = el('li');
    li.append(workLink(w.id, w.title), ' ', el('span', { class: 'count' }, meta));
    list.append(li);
  }
  section.hidden = false;
}

function fillRecent(data) {
  const list = document.querySelector('.recent .timeline');
  if (!list) return;
  for (const r of data.recent) {
    const li = el('li');
    li.append(el('time', { datetime: r.loggedAt }, r.loggedAt), ' ', workLink(r.id, r.title), ' ', el('span', { class: 'author' }, r.author));
    if (r.rating) li.append(' ', el('span', { class: 'rating' }, '★'.repeat(r.rating)));
    if (r.aired) li.append(' ', el('span', { class: 'watched' }, `${r.aired} 放送`));
    list.append(li);
  }
}

// One row per year with a cell for each month, like the archive of a blog.
function fillArchive(data) {
  const list = document.querySelector('.archive-years');
  if (!list) return;
  for (const y of data.years) {
    const months = el('ol', { class: 'archive-months' });
    y.months.forEach((n, i) => {
      const li = el('li');
      const label = el('span', { class: 'archive-month' }, `${i + 1}月`);
      if (n === 0) {
        li.className = 'is-empty';
        li.append(label);
      } else {
        const a = el('a', { href: `${base}m/${y.year}/${String(i + 1).padStart(2, '0')}/` });
        a.append(label, el('span', { class: 'count' }, String(n)));
        li.append(a);
      }
      months.append(li);
    });
    const li = el('li');
    const head = el('div', { class: 'archive-year' });
    head.append(el('a', { href: `${base}m/${y.year}/` }, `${y.year}年`), ' ', el('span', { class: 'count' }, `${y.logs} 件`));
    li.append(head, months);
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
    showNav(data);
    showAuthors(data);
    fillStats(data);
    fillThisSeason(data);
    fillRecent(data);
    fillArchive(data);
    fillOnThisDay(data);
  }
} catch (e) {
  console.warn('site.json could not be loaded', e);
}
