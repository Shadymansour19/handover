// Client-side .docx generation (SPEC.md: "no PDF, docx via the docx npm
// library"). Pure-ish: takes already-fetched data in, returns a Blob out —
// mainView.js owns fetching fresh (non-deleted) data for the current
// filter range and triggering the browser download.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  ShadingType,
  AlignmentType,
  TableLayoutType,
} from 'docx'
import { buildEquipmentTimeline } from './combinedTimeline.js'
import { formatDateDMY, formatDateTimeDMY } from './dateFormat.js'

const SYSTEM_BANNER_FILL = '1E293B' // matches --surface-alt
const EQUIPMENT_HEADER_COLOR = '2563EB'
const RUNNING_COLOR = '15803D'
const TABLE_HEADER_FILL = 'E2E8F0'

// Date | Scope | Status, percent — scope carries work_scope/detailed_steps/
// comment (or the action + comment for an operation event) all bulleted
// together, so it needs most of the row; Date and Status are short values.
const COLUMN_WIDTHS = [15, 65, 20]

function cell(content, { header = false, width, columnSpan } = {}) {
  const children = Array.isArray(content)
    ? content
    : [new Paragraph({ children: [new TextRun({ text: String(content ?? ''), bold: header })] })]

  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan,
    shading: header ? { fill: TABLE_HEADER_FILL, type: ShadingType.CLEAR } : undefined,
    children,
  })
}

function headerRow() {
  return new TableRow({
    // Marks this as the repeating header row — besides repeating it on
    // each page a table spans, this is also what stops Word orphaning the
    // header alone at the bottom of a page with the first data row
    // pushed to the next one; Word keeps a header row together with at
    // least one row of content when it paginates.
    tableHeader: true,
    children: ['Date', 'Scope', 'Status'].map((text, i) =>
      cell(text, { header: true, width: COLUMN_WIDTHS[i] })
    ),
  })
}

function noActivityRow() {
  return new TableRow({ children: [cell('No activity in this period', { columnSpan: 3 })] })
}

function bulletParagraphs(text) {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: line })] }))
}

function labeledBulletSection(label, text) {
  if (!text || !text.trim()) return []
  return [
    new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: label, bold: true })] }),
    ...bulletParagraphs(text),
  ]
}

// SPEC.md's date-range filter treats an open-ended end_date as "still in
// progress" — the export spells that out as "Ongoing" rather than leaving
// it blank.
function maintenanceDateRange(record) {
  const end = record.end_date ? formatDateDMY(record.end_date) : 'Ongoing'
  return `${formatDateDMY(record.start_date)} - ${end}`
}

function maintenanceScopeParagraphs(record) {
  return [
    new Paragraph({ children: [new TextRun({ text: record.work_scope, bold: true })] }),
    ...labeledBulletSection('Detailed Work Done:', record.detailed_steps),
    ...labeledBulletSection('Comments:', record.comment),
  ]
}

function maintenanceRow(record) {
  const status =
    record.work_status === 'Other' && record.work_status_other ? record.work_status_other : record.work_status
  return new TableRow({
    children: [
      cell(maintenanceDateRange(record), { width: COLUMN_WIDTHS[0] }),
      cell(maintenanceScopeParagraphs(record), { width: COLUMN_WIDTHS[1] }),
      cell(status, { width: COLUMN_WIDTHS[2] }),
    ],
  })
}

function operationActionLabel(event, equipmentId, nameOf) {
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  if (isSecondarySide) return `Swap ← ${nameOf(event.equipment_id)}`
  if (event.action === 'Swap') return `Swap → ${nameOf(event.secondary_equipment_id)}`
  return event.action
}

function operationScopeParagraphs(event, equipmentId, nameOf) {
  return [
    new Paragraph({
      children: [new TextRun({ text: operationActionLabel(event, equipmentId, nameOf), bold: true })],
    }),
    ...labeledBulletSection('Comments:', event.comment),
  ]
}

function operationRow(event, equipmentId, nameOf) {
  return new TableRow({
    children: [
      cell(formatDateTimeDMY(event.event_timestamp), { width: COLUMN_WIDTHS[0] }),
      cell(operationScopeParagraphs(event, equipmentId, nameOf), { width: COLUMN_WIDTHS[1] }),
      // Operation events have no work_status-equivalent field — left blank
      // rather than inventing one.
      cell('', { width: COLUMN_WIDTHS[2] }),
    ],
  })
}

function buildEquipmentTable(timeline, equipmentId, nameOf) {
  const rows = [headerRow()]
  if (timeline.length === 0) {
    rows.push(noActivityRow())
  } else {
    for (const item of timeline) {
      rows.push(
        item.type === 'maintenance'
          ? maintenanceRow(item.record)
          : operationRow(item.record, equipmentId, nameOf)
      )
    }
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Without this, Word ignores the per-cell percentage widths above and
    // auto-fits columns to content instead — which is why they all came
    // out equal width despite the correct percentages already being in
    // the file (confirmed by inspecting the XML directly; the values were
    // right, Word just wasn't honoring them without an explicit layout).
    layout: TableLayoutType.FIXED,
    rows,
  })
}

function systemBanner(name) {
  return new Paragraph({
    shading: { fill: SYSTEM_BANNER_FILL, type: ShadingType.CLEAR },
    spacing: { before: 300, after: 150 },
    // Keeps the banner on the same page as whatever follows it (the first
    // equipment header) rather than risking it sitting alone at the
    // bottom of a page — same reasoning as equipmentHeader() below.
    keepNext: true,
    children: [new TextRun({ text: name, bold: true, color: 'FFFFFF', size: 28 })],
  })
}

function equipmentHeader(name, isRunning) {
  const runs = [new TextRun({ text: name, bold: true, color: EQUIPMENT_HEADER_COLOR, size: 24 })]
  if (isRunning) {
    runs.push(new TextRun({ text: '  (Running)', bold: true, color: RUNNING_COLOR, size: 24 }))
  }
  // keepNext ties this paragraph to whatever comes right after it (its
  // table) for pagination purposes — without it, Word can leave the
  // headline alone at the bottom of a page with the table starting fresh
  // on the next one.
  return new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: runs })
}

// Builds the whole document and returns it as a Blob, ready to download.
// systems/records/operationEvents/equipmentStatuses should already be
// filtered to the desired date range and exclude deleted rows — this
// function doesn't re-filter or re-check permissions itself.
export async function exportRangeToDocx({
  systems,
  records,
  operationEvents,
  equipmentStatuses,
  range,
  exporterName,
}) {
  const equipmentById = new Map(systems.flatMap((s) => s.equipment).map((eq) => [eq.id, eq]))
  const nameOf = (id) => equipmentById.get(id)?.name ?? '—'

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Handover - ${exporterName}` })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: `${formatDateDMY(range.from)} to ${formatDateDMY(range.to)}`, italics: true }),
      ],
    }),
  ]

  for (const system of systems) {
    const equipmentWithTimelines = system.equipment.map((eq) => ({
      eq,
      timeline: buildEquipmentTimeline(eq.id, records, operationEvents),
    }))

    // Workshop / Others / Scarab GTG (hide_when_empty): omit any equipment
    // — and the whole system, if that empties it — with zero activity,
    // same rule the main view uses. The other three systems (PHVII GTG /
    // Main Compressor / Booster Compressor): never omit the system itself,
    // and always keep real (non-Generic) equipment even with zero
    // activity — but their catch-all "Generic" entry is still omitted if
    // it has nothing in it, in every system, tracked or not.
    const equipmentToShow = system.hide_when_empty
      ? equipmentWithTimelines.filter(({ timeline }) => timeline.length > 0)
      : equipmentWithTimelines.filter(({ eq, timeline }) => !eq.is_generic || timeline.length > 0)

    if (system.hide_when_empty && equipmentToShow.length === 0) continue

    children.push(systemBanner(system.name))

    for (const { eq, timeline } of equipmentToShow) {
      const isTracked = system.operation_tracked && !eq.is_generic
      const isRunning = isTracked && equipmentStatuses.get(eq.id) === 'Running'

      children.push(equipmentHeader(eq.name, isRunning))
      children.push(buildEquipmentTable(timeline, eq.id, nameOf))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

// Triggers a browser "Save As" for an in-memory Blob — no server round
// trip, matching "client-side .docx generation" (SPEC.md).
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
