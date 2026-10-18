import { escapeHTML } from './html.js'

// Multi-line fields (detailed_steps, comment, pending) are stored as plain
// text with \n-separated lines (see SPEC.md "Other assumptions"), rendered
// as a bullet list wherever they're displayed read-only. A line's leading
// tab characters (added by lib/listFormatToolbar.js's Indent/Outdent
// buttons) set its nesting depth — existing data has no leading tabs, so
// it all renders as one flat depth-0 list exactly as before this was
// added (backward compatible by construction, not by a special case).
function parseLines(text) {
  return (text ?? '')
    .split('\n')
    .map((line) => {
      const depth = line.match(/^\t*/)[0].length
      const content = line.slice(depth).trim()
      return { depth, content }
    })
    .filter((item) => item.content !== '')
}

// Turns the flat {depth, content}[] into a tree so sibling bullets at the
// same depth share one <ul> and a deeper line nests inside its nearest
// shallower-depth <li>, instead of a new list starting at every line.
function buildTree(items) {
  const root = []
  const stack = [{ depth: -1, container: root }]
  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth) stack.pop()
    const node = { content: item.content, children: [] }
    stack[stack.length - 1].container.push(node)
    stack.push({ depth: item.depth, container: node.children })
  }
  return root
}

function renderNodes(nodes) {
  if (nodes.length === 0) return ''
  const items = nodes
    .map((node) => `<li>${escapeHTML(node.content)}${renderNodes(node.children)}</li>`)
    .join('')
  return `<ul class="bullet-list">${items}</ul>`
}

export function renderBulletList(text) {
  const items = parseLines(text)
  if (items.length === 0) return '<p class="empty-field">—</p>'
  return renderNodes(buildTree(items))
}
