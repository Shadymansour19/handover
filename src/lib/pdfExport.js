// Client-side .pdf generation via pdfmake — a second export format
// alongside docxExport.js, built from the identical already-fetched data
// (mainView.js's Export/Export PDF FABs both fetch fresh non-deleted data
// for the current filter range and pass it to whichever of these two gets
// called). Deliberately mirrors docxExport.js's content/omission rules
// exactly (same System banner → Equipment header → chronological table
// structure, same hide_when_empty / Generic-equipment omission, same Swap
// event on both units) so the two export formats never drift apart —
// only the rendering API differs.
import { buildEquipmentTimeline } from './combinedTimeline.js'
import { formatDateDMY, formatDateTimeDMY } from './dateFormat.js'

const SYSTEM_BANNER_FILL = '#1e293b' // matches --surface-alt
const EQUIPMENT_HEADER_COLOR = '#2563eb'
const RUNNING_COLOR = '#15803d'
const TABLE_HEADER_FILL = '#e2e8f0'
// Black and a bit wider than a typical hairline (0.5pt) — asked for
// specifically so the table grid is easily visible at a glance, rather
// than the previous light-gray/thin combination.
const TABLE_LINE_COLOR = '#000000'

// Bumped up from the initial pass (18/13/11) — title/system/equipment
// headings were all too small relative to their role in the document.
const TITLE_FONT_SIZE = 22
const SYSTEM_BANNER_FONT_SIZE = 16
const EQUIPMENT_HEADER_FONT_SIZE = 13

// Used below to decide when it's safe to bundle an equipment header with
// its table as one `unbreakable: true` stack (pdfmake's only real "keep
// together" primitive, and the only way to stop a header/table pair from
// landing on two different pages — there's no per-element keepNext like
// docx's). It's capped, not unconditional, because `unbreakable` was
// directly verified to be unsafe for a block taller than one page: if it
// doesn't fit even on a fresh page, pdfmake doesn't fall back to breaking
// it — it silently drops the entire stack (confirmed with a real 25-row
// table: the whole banner+header+table section vanished from a generated
// PDF). A small block, by contrast, was directly verified to behave
// correctly: pushed to a matching page it fits on, nothing lost.
// This row count is a conservative, intentionally-rough proxy for "small
// enough to safely assume it fits on one page" — most real usage (the
// app's default filter is "last 7 days") comfortably falls under it.
// Above the cap, header+table fall back to plain sequential rendering:
// occasionally an orphaned header, never a dropped record.
const MAX_ROWS_FOR_KEEP_TOGETHER = 6

// Date | Scope | Status — same proportions as docxExport.js's
// COLUMN_WIDTHS (scope carries work_scope/detailed_steps/comment, or the
// action + comment for an operation event, bulleted together, so it needs
// most of the row).
const COLUMN_WIDTHS = ['20%', '60%', '20%']

const TABLE_LAYOUT = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => TABLE_LINE_COLOR,
  vLineColor: () => TABLE_LINE_COLOR,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
}

// systemBanner() below renders as a single-cell, full-width table rather
// than a plain text node specifically so `fillColor` paints the whole
// line — a table cell's fillColor spans the cell's full width, but a
// plain text node's `background` (see the earlier fix) only wraps tightly
// around the text itself, which read as "half a banner" next to the
// .docx version's full-width one. No visible grid of its own: zero border
// width, only the padding a real border would otherwise need.
const BANNER_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
}

function headerRow() {
  return ['Date', 'Scope', 'Status'].map((text) => ({ text, bold: true, fillColor: TABLE_HEADER_FILL }))
}

function noActivityRow() {
  return [{ text: 'No activity in this period', colSpan: 3, italics: true }, {}, {}]
}

// pdfmake's own `ul` renders a real bullet list (hanging indent included by
// default) — no need for docxExport.js's custom minimal-indent numbering
// hack, which existed only to work around Word's much larger default.
function bulletLines(text) {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function labeledBulletSection(label, text) {
  const lines = bulletLines(text)
  if (lines.length === 0) return []
  return [
    { text: label, bold: true, margin: [0, 6, 0, 2] },
    { ul: lines },
  ]
}

// SPEC.md's date-range filter treats an open-ended end_date as "still in
// progress" — spelled out as "Ongoing" rather than left blank.
function maintenanceDateRange(record) {
  const end = record.end_date ? formatDateDMY(record.end_date) : 'Ongoing'
  return `${formatDateDMY(record.start_date)} - ${end}`
}

function maintenanceScopeCell(record) {
  return {
    stack: [
      { text: record.work_scope, bold: true },
      ...labeledBulletSection('Detailed Work Done:', record.detailed_steps),
      ...labeledBulletSection('Comments:', record.comment),
    ],
  }
}

function maintenanceRow(record) {
  const status =
    record.work_status === 'Other' && record.work_status_other ? record.work_status_other : record.work_status
  return [{ text: maintenanceDateRange(record) }, maintenanceScopeCell(record), { text: status }]
}

function operationActionLabel(event, equipmentId, nameOf) {
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  if (isSecondarySide) return `Swap ← ${nameOf(event.equipment_id)}`
  if (event.action === 'Swap') return `Swap → ${nameOf(event.secondary_equipment_id)}`
  return event.action
}

function operationRow(event, equipmentId, nameOf) {
  return [
    { text: formatDateTimeDMY(event.event_timestamp) },
    {
      stack: [
        { text: operationActionLabel(event, equipmentId, nameOf), bold: true },
        ...labeledBulletSection('Comments:', event.comment),
      ],
    },
    // Operation events have no work_status-equivalent field — left blank
    // rather than inventing one (matches docxExport.js).
    { text: '' },
  ]
}

function buildEquipmentTable(timeline, equipmentId, nameOf) {
  const body = [headerRow()]
  if (timeline.length === 0) {
    body.push(noActivityRow())
  } else {
    for (const item of timeline) {
      body.push(
        item.type === 'maintenance' ? maintenanceRow(item.record) : operationRow(item.record, equipmentId, nameOf)
      )
    }
  }
  return {
    table: { headerRows: 1, widths: COLUMN_WIDTHS, body },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 10],
  }
}

function systemBanner(name) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: name, bold: true, color: 'white', fontSize: SYSTEM_BANNER_FONT_SIZE, fillColor: SYSTEM_BANNER_FILL }]],
    },
    layout: BANNER_LAYOUT,
    margin: [0, 8, 0, 6],
  }
}

function equipmentHeader(name, isRunning) {
  const text = [{ text: name, bold: true, color: EQUIPMENT_HEADER_COLOR, fontSize: EQUIPMENT_HEADER_FONT_SIZE }]
  if (isRunning) {
    text.push({ text: '  (Running)', bold: true, color: RUNNING_COLOR, fontSize: EQUIPMENT_HEADER_FONT_SIZE })
  }
  return { text, margin: [0, 8, 0, 3] }
}

// Builds the whole document and returns it as a Blob, ready to download.
// systems/records/operationEvents/equipmentStatuses should already be
// filtered to the desired date range and exclude deleted rows — this
// function doesn't re-filter or re-check permissions itself (same contract
// as docxExport.js's exportRangeToDocx).
export async function exportRangeToPdf({
  systems,
  records,
  operationEvents,
  equipmentStatuses,
  range,
  exporterName,
}) {
  const equipmentById = new Map(systems.flatMap((s) => s.equipment).map((eq) => [eq.id, eq]))
  const nameOf = (id) => equipmentById.get(id)?.name ?? '—'

  const content = [
    { text: `Handover - ${exporterName}`, style: 'title', alignment: 'center' },
    {
      text: `${formatDateDMY(range.from)} to ${formatDateDMY(range.to)}`,
      italics: true,
      alignment: 'center',
      margin: [0, 0, 0, 14],
    },
  ]

  for (const system of systems) {
    const equipmentWithTimelines = system.equipment.map((eq) => ({
      eq,
      timeline: buildEquipmentTimeline(eq.id, records, operationEvents),
    }))

    // Same omission rule as docxExport.js/the main view: Workshop / Others
    // / Scarab GTG (hide_when_empty) drop any equipment — and the whole
    // system, if that empties it — with zero activity; the other three
    // systems never omit the system itself or real (non-Generic)
    // equipment, but still drop an empty "Generic" catch-all everywhere.
    const equipmentToShow = system.hide_when_empty
      ? equipmentWithTimelines.filter(({ timeline }) => timeline.length > 0)
      : equipmentWithTimelines.filter(({ eq, timeline }) => !eq.is_generic || timeline.length > 0)

    if (system.hide_when_empty && equipmentToShow.length === 0) continue

    equipmentToShow.forEach(({ eq, timeline }, index) => {
      const isTracked = system.operation_tracked && !eq.is_generic
      const isRunning = isTracked && equipmentStatuses.get(eq.id) === 'Running'
      const header = equipmentHeader(eq.name, isRunning)
      const table = buildEquipmentTable(timeline, eq.id, nameOf)
      // The banner only needs to ride along with the FIRST equipment's
      // block — it just needs to not be orphaned alone at a page bottom,
      // and bundling it with every equipment would be pointless (it only
      // ever appears once per system, right before the first one anyway).
      const pieces = index === 0 ? [systemBanner(system.name), header, table] : [header, table]

      if (timeline.length <= MAX_ROWS_FOR_KEEP_TOGETHER) {
        content.push({ stack: pieces, unbreakable: true })
      } else {
        content.push(...pieces)
      }
    })
  }

  // pdfmake ships its own bundled Roboto font set as a plain filename ->
  // base64 map (not nested under a `.pdfMake.vfs` key, despite what older
  // docs/examples show — confirmed directly against the installed
  // version) — assigning it straight to `.vfs` is what actually works.
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  pdfMake.vfs = vfs

  const docDefinition = {
    content,
    styles: {
      title: { fontSize: TITLE_FONT_SIZE, bold: true, margin: [0, 0, 0, 4] },
    },
    defaultStyle: { fontSize: 9 },
    pageMargins: [36, 36, 36, 36],
  }

  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob(resolve)
    } catch (err) {
      reject(err)
    }
  })
}
