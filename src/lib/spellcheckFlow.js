import { openModal } from './modal.js'
import { escapeHTML } from './html.js'

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Resolves to an action object describing what the user chose —
// { action: 'replace', value } | { action: 'skip' } | { action: 'skipAll' } |
// { action: 'addToDictionary' } — one modal per distinct misspelled word,
// closed either way before resolving so runSpellcheck() below never has two
// of these stacked.
function promptForWord(word, suggestions) {
  return new Promise((resolve) => {
    const suggestionsHTML = suggestions.length
      ? suggestions
          .slice(0, 6)
          .map(
            (suggestion) =>
              `<button type="button" data-suggestion="${escapeHTML(suggestion)}">${escapeHTML(suggestion)}</button>`
          )
          .join('')
      : '<p class="empty-field">No suggestions.</p>'

    const { modalEl, close } = openModal(`
      <h2>Possible spelling mistake</h2>
      <p>"<strong>${escapeHTML(word)}</strong>" doesn't look like a recognized word.</p>
      <div class="spellcheck-suggestions">${suggestionsHTML}</div>
      <div class="modal-actions spellcheck-actions">
        <button type="button" id="spellcheck-add-dictionary">Add to Dictionary</button>
        <button type="button" id="spellcheck-skip-all">Skip all</button>
        <button type="button" id="spellcheck-skip">Skip</button>
      </div>
    `)

    modalEl.addEventListener('click', (event) => {
      const suggestionButton = event.target.closest('button[data-suggestion]')
      if (suggestionButton) {
        close()
        resolve({ action: 'replace', value: suggestionButton.dataset.suggestion })
        return
      }
      if (event.target.closest('#spellcheck-add-dictionary')) {
        close()
        resolve({ action: 'addToDictionary' })
        return
      }
      if (event.target.closest('#spellcheck-skip-all')) {
        close()
        resolve({ action: 'skipAll' })
        return
      }
      if (event.target.closest('#spellcheck-skip')) {
        close()
        resolve({ action: 'skip' })
      }
    })
  })
}

// Scans each named field in `fields` for misspelled words (lib/spellcheck.js)
// and, for each one found, prompts the user to pick a suggestion, skip it,
// add it to their personal dictionary, or skip everything remaining —
// looping over every misspelled word across every field, one dialog at a
// time, before returning. Returns a NEW fields object with chosen
// corrections applied; fields not in `fieldNames`, or with no text, pass
// through unchanged. Called from the submit handlers (recordModal.js,
// operationEventModal.js) after title/sentence case has already been
// applied, so spellcheck sees the final text rather than re-running
// against pre-case-normalized text.
export async function runSpellcheck(fields, fieldNames) {
  const { findMisspellings, suggestionsFor, addToDictionary } = await import('./spellcheck.js')

  const updated = { ...fields }
  fieldLoop: for (const fieldName of fieldNames) {
    let text = updated[fieldName]
    if (!text) continue

    const misspellings = await findMisspellings(text)
    for (const word of misspellings) {
      // An earlier correction in this same field may have already
      // replaced every occurrence of this word (e.g. it appeared twice
      // and the first fix's whole-word replace below caught both) — skip
      // re-prompting for a word that's no longer actually present.
      if (!new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text)) continue

      const suggestions = await suggestionsFor(word)
      const result = await promptForWord(word, suggestions)

      if (result.action === 'skipAll') {
        updated[fieldName] = text
        break fieldLoop
      }
      if (result.action === 'addToDictionary') {
        await addToDictionary(word)
        continue
      }
      if (result.action === 'replace') {
        text = text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'), result.value)
      }
    }
    updated[fieldName] = text
  }
  return updated
}
