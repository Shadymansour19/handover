// Client-side spell-checking, on submit (recordModal.js, operationEventModal.js)
// — see SPEC.md "spellcheck on submit" for why this is a real Hunspell
// dictionary rather than a hosted/paid API: same reasoning as the
// work-scope autocomplete decision (no backend of this app's own to call
// from). nspell + dictionary-en are both plain data/logic with zero
// network dependency once loaded, so this works fully offline too.
//
// Lazy-loaded (dynamic import, called from runSpellcheck() below) rather
// than a top-level import — the dictionary is ~550KB of word data, no
// reason for every page load to pay for it when most of them never
// submit a form.
import nspell from 'nspell'
import { TECHNICAL_TERMS } from './technicalDictionary.js'

// `dictionary-en`'s own package.json only exports "./index.js" (a
// Node-only loader using fs.readFile + import.meta.url — doesn't work in
// a browser bundle at all), so its .aff/.dic data files are pulled in
// directly as text via Vite's `?raw` import instead, bypassing that
// loader entirely. Absolute path (not a relative one) because dev and
// build resolve `/node_modules/...` the same way regardless of which
// file this module happens to be imported from.
let spellerPromise = null
function getSpeller() {
  if (!spellerPromise) {
    spellerPromise = Promise.all([
      import('/node_modules/dictionary-en/index.aff?raw'),
      import('/node_modules/dictionary-en/index.dic?raw'),
    ]).then(([{ default: aff }, { default: dic }]) => {
      const speller = nspell(aff, dic)
      for (const word of TECHNICAL_TERMS) speller.add(word)
      for (const word of loadCustomWords()) speller.add(word)
      return speller
    })
  }
  return spellerPromise
}

// "Add to Dictionary" (spellcheckFlow.js) persists here — this device only,
// no backend of its own to sync it through (same reasoning as everything
// else in this file being a local Hunspell dictionary rather than a hosted
// service). localStorage, not sessionStorage, since the whole point is for
// it to survive closing the tab.
const CUSTOM_DICT_KEY = 'handover-custom-dictionary'

function loadCustomWords() {
  try {
    const raw = localStorage.getItem(CUSTOM_DICT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Adds `word` to the persisted custom dictionary and to the already-loaded
// speller (if any), so it stops being flagged for the rest of this session
// too, not just after a future reload.
export async function addToDictionary(word) {
  const key = word.toLowerCase()
  const words = loadCustomWords()
  if (!words.includes(key)) {
    words.push(key)
    try {
      localStorage.setItem(CUSTOM_DICT_KEY, JSON.stringify(words))
    } catch {
      // Storage full/unavailable (private browsing, etc.) — the word still
      // gets added to the in-memory speller below, just won't persist.
    }
  }
  const speller = await getSpeller()
  speller.add(key)
}

// Letters and internal apostrophes only ("don't", "it's") — numbers,
// equipment tags (GT-8040), and punctuation are never flagged, since
// they're not English words to begin with and a Hunspell dictionary has
// no useful opinion on them.
const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)?/g

// Distinct misspelled words in `text`, in first-seen order — the caller
// (lib/spellcheckFlow.js) prompts once per distinct word, not once per
// occurrence, so a word repeated several times in one field only asks
// once.
export async function findMisspellings(text) {
  const speller = await getSpeller()
  const words = text.match(WORD_PATTERN) ?? []
  const seen = new Set()
  const misspelled = []
  for (const word of words) {
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!speller.correct(word)) misspelled.push(word)
  }
  return misspelled
}

export async function suggestionsFor(word) {
  const speller = await getSpeller()
  return speller.suggest(word)
}
