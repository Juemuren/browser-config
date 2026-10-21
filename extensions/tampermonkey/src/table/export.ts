import JSZip from 'jszip'
import { download, safeFilename } from '../shared'

export interface TableChoice {
  element: HTMLTableElement
  label: string
  rows: number
  columns: number
}

export function scanTables(): TableChoice[] {
  return Array.from(document.querySelectorAll('table')).map(
    (element, index) => {
      const firstRow = element.rows[0]
      const caption = element.caption?.textContent?.trim()
      return {
        element,
        label: caption || `表格 ${index + 1}`,
        rows: element.rows.length,
        columns: firstRow?.cells.length ?? 0,
      }
    },
  )
}

function csvCell(value: string): string {
  const clean = value.trim().replace(/\r\n?/g, '\n')
  return /[",\n]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean
}

export function toCsv(table: HTMLTableElement): string {
  const rows = Array.from(table.rows, (row) =>
    Array.from(row.cells, (cell) =>
      csvCell((cell as HTMLElement).innerText || cell.textContent || ''),
    ).join(','),
  )
  return `\uFEFF${rows.join('\r\n')}`
}

export async function exportTables(choices: TableChoice[]): Promise<void> {
  const base = safeFilename(document.title, 'table')
  if (choices.length === 1) {
    download(
      new Blob([toCsv(choices[0].element)], { type: 'text/csv;charset=utf-8' }),
      `${base}.csv`,
    )
    return
  }
  const zip = new JSZip()
  for (const [index, choice] of choices.entries()) {
    zip.file(
      `${String(index + 1).padStart(2, '0')}-${safeFilename(choice.label, 'table')}.csv`,
      toCsv(choice.element),
    )
  }
  download(await zip.generateAsync({ type: 'blob' }), `${base}-tables.zip`)
}
