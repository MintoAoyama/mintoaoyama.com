// Fills the parts of pages that depend on the whole data set (data/site.json).
const base = document.querySelector('meta[name="stash-base"]')?.content ?? '/';

const el = (tag, attrs = {}, text) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

// Same shard rule as workShard in src/pages.ts.
const workHref = (id) => `${base}w/${encodeURIComponent(id.slice(-1))}/${encodeURIComponent(id)}/`;
const workLink = (id, title) => el('a', { href: workHref(id) }, title);

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
const THIS_SEASON_CARDS = 6;
const RECENT_CARDS = 9;

// The season of the day the page is opened, like the schema's: winter is January to March.
function thisSeason() {
  const now = new Date();
  const [name, label] = SEASONS[Math.floor(now.getMonth() / 3)];
  return { season: `${now.getFullYear()}-${name}`, label: `${now.getFullYear()}${label}` };
}

// A text card with the start of a log (digest), cut as the work page cuts it.
// The author goes apart from the meta: it is hidden while there is one author, and its separator with it.
function digestCard(href, title, meta, r, author = '') {
  const li = el('li', { class: 'card card--text card--digest' });
  const a = el('a', { href });
  a.append(el('span', { class: 'card-title' }, title));
  const info = el('span', { class: 'card-meta' });
  meta.filter(Boolean).forEach((m, i) => info.append(i === 0 ? '' : ' · ', m));
  if (author) info.append(el('span', { class: 'author' }, ` · ${author}`));
  if (r.rating) info.append(' ', el('span', { class: 'rating', 'aria-label': `評価 ${r.rating} / 5` }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)));
  li.append(a, info);
  if (r.heading) li.append(el('span', { class: 'card-heading' }, r.heading));
  if (r.digest) li.append(el('p', { class: 'card-digest' }, r.digest));
  return li;
}

// The works of the season most recently logged; the season page has them all.
function fillThisSeason(data) {
  const section = document.querySelector('.this-season');
  if (!section) return;
  const { season, label } = thisSeason();
  const works = data.seasonWorks[season] ?? [];
  if (works.length === 0) return;
  const link = section.querySelector('.season-link');
  link.href = `${base}s/${season}/`;
  link.textContent = label;
  const list = section.querySelector('ul');
  for (const w of works.slice(0, THIS_SEASON_CARDS)) {
    const progress = w.episode === null ? '' : w.episodeCount ? `第${w.episode}話まで / ${w.episodeCount}` : `第${w.episode}話まで`;
    list.append(digestCard(workHref(w.id), w.title, [w.channel, progress, w.loggedAt], w));
  }
  if (works.length > THIS_SEASON_CARDS) {
    const more = section.querySelector('.season-more');
    more.href = link.href;
    more.textContent = `${label}の ${works.length} 件をすべて見る`;
    more.parentElement.hidden = false;
  }
  section.hidden = false;
}

// The newest logs of works outside the season shown above.
function fillRecent(data) {
  const section = document.querySelector('.recent');
  if (!section) return;
  const { season } = thisSeason();
  const logs = data.recent.filter((r) => r.season !== season).slice(0, RECENT_CARDS);
  if (logs.length === 0) return;
  const list = section.querySelector('ul');
  for (const r of logs) {
    const date = el('time', { datetime: r.loggedAt }, r.loggedAt);
    const meta = [date, r.aired ? el('span', { class: 'watched' }, `${r.aired} 放送`) : ''];
    list.append(digestCard(`${workHref(r.id)}${encodeURIComponent(r.log)}/`, r.title, meta, r, r.author));
  }
  section.hidden = false;
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
