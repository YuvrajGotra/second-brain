const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have how i if in into is it its
  me my of on or our so than that the their them then there these they this to was we were what when where
  which who why will with would you your about also just not no yes all any more most some such only very`.split(/\s+/),
);

/** Lowercase word tokens with stopwords removed and a light suffix-stripping stemmer. */
export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function stem(word) {
  if (word.length <= 4) return word;
  return word.replace(/(ing|edly|ed|ies|es|s|ly)$/, (m) => (m === 'ies' ? 'y' : ''));
}

export function splitSentences(text) {
  // Split after ., !, ? followed by whitespace + capital/digit/quote; keeps abbreviations mostly intact.
  return text
    .split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Rough token count (~4 chars per token for English) used for context budgeting. */
export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
