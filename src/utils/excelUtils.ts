import * as XLSX from 'xlsx'

function excelValue(value: unknown): unknown {
  if (value == null) return ''
  if (value instanceof Date) return value
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

export function exportRecordsToExcel(
  records: Array<Record<string, unknown>>,
  filename: string,
  sheetName: string
) {
  const keys = Array.from(new Set(records.flatMap(record => Object.keys(record))))
  const rows = records.map(record => {
    const row: Record<string, unknown> = {}
    keys.forEach(key => { row[key] = excelValue(record[key]) })
    return row
  })
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: keys })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
