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
} from 'docx'
import { buildEquipmentTimeline } from './combinedTimeline.js'
import { formatDateDMY, formatDateTimeDMY } from './dateFormat.js'

const SYSTEM_BANNER_FILL = '1E293B' // matches --surface-alt
const EQUIPMENT_HEADER_COLOR = '2563EB'
const RUNNING_COLOR = '15803D'
const TABLE_HEADER_FILL = 'E2E8F0'

const COLUMN_WIDTHS = [20, 45, 35] // Date | Scope/Action | Status/Comment, percent

function cell(text, { header = false, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { fill: TABLE_HEADER_FILL, type: ShadingType.CLEAR } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? ''), bold: header })],
      }),
    ],
  })
}

function row(cells, options) {
  return new TableRow({
    children: cells.map((text, i) => cell(text, { ...options, width: COLUMN_WIDTHS[i] })),
  })
}

function maintenanceRowCells(record) {
  const status =
    record.work_status === 'Other' && record.work_status_other ? record.work_status_other : record.work_status
  return [formatDateDMY(record.start_date), record.work_scope, status]
}

function operationRowCells(event, equipmentId, nameOf) {
  const isSecondarySide = event.secondary_equipment_id === equipmentId
  const actionLabel = isSecondarySide
    ? `Swap ← ${nameOf(event.equipment_id)}`
    : event.action === 'Swap'
      ? `Swap → ${nameOf(event.secondary_equipment_id)}`
      : event.action
  return [formatDateTimeDMY(event.event_timestamp), actionLabel, event.comment ?? '']
}

function buildEquipmentTable(timeline, equipmentId, nameOf) {
  const rows = [
    row(['Date', 'Scope / Action', 'Status / Comment'], { header: true }),
    ...timeline.map((item) =>
      row(
        item.type === 'maintenance'
          ? maintenanceRowCells(item.record)
          : operationRowCells(item.record, equipmentId, nameOf)
      )
    ),
  ]
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function systemBanner(name) {
  return new Paragraph({
    shading: { fill: SYSTEM_BANNER_FILL, type: ShadingType.CLEAR },
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text: name, bold: true, color: 'FFFFFF', size: 28 })],
  })
}

function equipmentHeader(name, isRunning) {
  const runs = [new TextRun({ text: name, bold: true, color: EQUIPMENT_HEADER_COLOR, size: 24 })]
  if (isRunning) {
    runs.push(new TextRun({ text: '  (Running)', bold: true, color: RUNNING_COLOR, size: 24 }))
  }
  return new Paragraph({ spacing: { before: 200, after: 100 }, children: runs })
}

// Builds the whole document and returns it as a Blob, ready to download.
// systems/records/operationEvents/equipmentStatuses should already be
// filtered to the desired date range and exclude deleted rows — this
// function doesn't re-filter or re-check permissions itself.
export async function exportRangeToDocx({ systems, records, operationEvents, equipmentStatuses, range }) {
  const equipmentById = new Map(systems.flatMap((s) => s.equipment).map((eq) => [eq.id, eq]))
  const nameOf = (id) => equipmentById.get(id)?.name ?? '—'

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Handover — Maintenance & Operations Report' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: `${formatDateDMY(range.from)} to ${formatDateDMY(range.to)}`, italics: true }),
      ],
    }),
  ]

  let anySystemIncluded = false

  for (const system of systems) {
    // Spec: omit ANY system with zero activity in the period — unlike the
    // main view (where PHVII GTG/Main Compressor/Booster Compressor always
    // show even with zero maintenance records), the export applies this to
    // every system, not just Workshop/Others/Scarab GTG.
    const equipmentWithTimelines = system.equipment
      .map((eq) => ({ eq, timeline: buildEquipmentTimeline(eq.id, records, operationEvents) }))
      .filter(({ timeline }) => timeline.length > 0)

    if (equipmentWithTimelines.length === 0) continue

    anySystemIncluded = true
    children.push(systemBanner(system.name))

    for (const { eq, timeline } of equipmentWithTimelines) {
      const isTracked = system.operation_tracked && !eq.is_generic
      const isRunning = isTracked && equipmentStatuses.get(eq.id) === 'Running'

      children.push(equipmentHeader(eq.name, isRunning))
      children.push(buildEquipmentTable(timeline, eq.id, nameOf))
    }
  }

  if (!anySystemIncluded) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [new TextRun({ text: 'No activity recorded in this date range.', italics: true })],
      })
    )
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
