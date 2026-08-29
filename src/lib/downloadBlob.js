// Triggers a browser "Save As" for an in-memory Blob — no server round
// trip, matching "client-side export" (SPEC.md). Shared by docxExport.js
// and pdfExport.js: kept in its own zero-dependency file (rather than
// living inside one of those) so importing it doesn't drag either export
// library into the other's lazy-loaded chunk.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
