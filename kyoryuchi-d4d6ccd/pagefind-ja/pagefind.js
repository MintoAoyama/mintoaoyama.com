// Search API for the index built by scripts/pagefind-index.mjs. The Pagefind
// component UI loads this through <pagefind-config bundle-path>.
//
// The index holds Japanese words as split by Intl.Segmenter, so search terms are
// split the same way here. The boundaries the index script inserted (U+2060 and a
// space) are removed from the result data, which restores the original text.
import * as pagefind from '../pagefind/pagefind.js';

export * from '../pagefind/pagefind.js';

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined'
    ? new Intl.Segmenter('ja', { granularity: 'word' })
    : null;

const splitTerm = (term) => {
  if (typeof term !== 'string' || segmenter === null) return term;
  const words = [];
  for (const { segment } of segmenter.segment(term)) words.push(segment);
  return words.join(' ').replace(/\s+/g, ' ').trim();
};

// The space may be separated from U+2060 by the <mark> tags of a highlighted word.
const BOUNDARY = /⁠((?:<\/?mark>)*) ?/g;

const restore = (value) => {
  if (typeof value === 'string') return value.replace(BOUNDARY, '$1');
  if (Array.isArray(value)) return value.map(restore);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, restore(v)]));
  }
  return value;
};

const restoreResults = (response) =>
  response && {
    ...response,
    results: response.results.map((result) => ({
      ...result,
      data: async () => restore(await result.data()),
    })),
  };

export function createInstance(options) {
  const instance = pagefind.createInstance(options);
  return {
    ...instance,
    search: async (term, searchOptions) =>
      restoreResults(await instance.search(splitTerm(term), searchOptions)),
    debouncedSearch: async (term, searchOptions, debounceTimeoutMs) =>
      restoreResults(await instance.debouncedSearch(splitTerm(term), searchOptions, debounceTimeoutMs)),
    preload: (term, searchOptions) => instance.preload(splitTerm(term), searchOptions),
  };
}
