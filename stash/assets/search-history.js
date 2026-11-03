// Recent queries, offered in a drop-down under a search box. They stay in this browser only; when storage is
// unavailable (private windows, blocked site data) the boxes work without them.
import { rememberQuery, suggestions } from './search-core.js';

const KEY = 'stash.search.history';

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((h) => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Not kept; nothing else depends on it.
  }
}

export const keepQuery = (query) => save(rememberQuery(load(), query));

const el = (tag, attrs = {}, text) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

let boxes = 0;

// Picking a query submits the box's form, as Enter would.
export function attachHistory(input) {
  const form = input.form;
  const id = `search-suggest-${++boxes}`;
  const panel = el('div', { class: 'search-suggest', hidden: '' });
  const list = el('ul', { role: 'listbox', id, 'aria-label': '最近の検索' });
  const clear = el('button', { type: 'button', class: 'search-suggest-clear', tabindex: '-1' }, '履歴をすべて消す');
  panel.append(list, clear);
  form.append(panel);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  let items = [];
  let active = -1;

  function close() {
    panel.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(i) {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', `${id}-${i}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function open() {
    items = suggestions(load(), input.value);
    if (items.length === 0 || document.activeElement !== input) return close();
    list.replaceChildren(
      ...items.map((q, i) => {
        const li = el('li', { role: 'option', id: `${id}-${i}`, 'aria-selected': 'false', 'data-query': q });
        li.append(el('span', {}, q), el('button', { type: 'button', tabindex: '-1', 'data-forget': q, 'aria-label': `「${q}」を履歴から消す` }, '×'));
        return li;
      }),
    );
    active = -1;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function pick(q) {
    input.value = q;
    close();
    form.requestSubmit();
  }

  function forget(q) {
    save(load().filter((h) => h !== q));
    open();
  }

  // Keeps the focus in the box, so that a click in the panel does not close it first.
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  panel.addEventListener('click', (e) => {
    const x = e.target.closest('[data-forget]');
    if (x) return forget(x.dataset.forget);
    if (e.target.closest('.search-suggest-clear')) {
      save([]);
      return close();
    }
    const option = e.target.closest('[data-query]');
    if (option) pick(option.dataset.query);
  });
  input.addEventListener('focus', open);
  input.addEventListener('click', () => panel.hidden && open());
  input.addEventListener('input', open);
  input.addEventListener('blur', close);
  // A tap outside does not always take the focus from the box on iOS.
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !form.contains(e.target)) close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (panel.hidden) open();
      if (items.length === 0) return;
      e.preventDefault();
      // Past the last (or above the first) goes back to what was typed, as -1.
      const states = items.length + 1;
      highlight((((active + 1 + (e.key === 'ArrowDown' ? 1 : -1)) % states) + states) % states - 1);
    } else if (e.key === 'Enter' && !panel.hidden && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape' && !panel.hidden) {
      e.preventDefault();
      close();
    } else if (e.key === 'Delete' && e.shiftKey && !panel.hidden && active >= 0) {
      e.preventDefault();
      forget(items[active]);
    }
  });
  form.addEventListener('submit', () => {
    keepQuery(input.value);
    close();
  });
}
