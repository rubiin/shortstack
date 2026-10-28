export class CsvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvError'
  }
}

export const CSV_MAX_BYTES = 1_000_000
export const CSV_MAX_ROWS = 1_000

export type ParsedCsv = {
  headers: string[]
  rows: Array<{ rowNumber: number; values: string[] }>
}

export function parseCsv(
  input: string,
  options: { maxBytes?: number; maxRows?: number } = {},
): ParsedCsv {
  const maxBytes = options.maxBytes ?? CSV_MAX_BYTES
  const maxRows = options.maxRows ?? CSV_MAX_ROWS
  if (new TextEncoder().encode(input).byteLength > maxBytes) {
    throw new CsvError(`CSV must be smaller than ${Math.round(maxBytes / 1000)} KB.`)
  }
  let text = input.replace(/^\uFEFF/, '')
  if (!text.trim()) throw new CsvError('Paste or upload a CSV with a header row.')

  const records: string[][] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let closedQuote = false
  let line = 1

  const finishField = () => {
    fields.push(field)
    field = ''
    closedQuote = false
  }
  const finishRecord = () => {
    finishField()
    if (fields.some((value) => value.trim() !== '')) records.push(fields)
    fields = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          closedQuote = true
        }
      } else {
        field += char
        if (char === '\n') line += 1
      }
      continue
    }

    if (char === '"') {
      if (field.length > 0 || closedQuote) {
        throw new CsvError(`Unexpected quote near line ${line}.`)
      }
      inQuotes = true
      continue
    }
    if (char === ',') {
      finishField()
      continue
    }
    if (char === '\n') {
      finishRecord()
      line += 1
      continue
    }
    if (char === '\r') {
      if (text[index + 1] === '\n') index += 1
      finishRecord()
      line += 1
      continue
    }
    if (closedQuote) {
      if (char === ' ' || char === '\t') continue
      throw new CsvError(`Unexpected text after a closing quote near line ${line}.`)
    }
    field += char
  }

  if (inQuotes) throw new CsvError('CSV ends inside a quoted field.')
  finishRecord()

  if (records.length === 0) throw new CsvError('CSV has no header row.')
  if (records.length === 1) throw new CsvError('CSV needs at least one data row.')

  const headers = records[0]!.map((header) => header.trim())
  if (headers.some((header) => !header)) throw new CsvError('Every CSV column needs a header.')
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new CsvError('CSV headers must be unique.')
  }
  if (records.length - 1 > maxRows) {
    throw new CsvError(`Import at most ${maxRows} rows at a time.`)
  }

  const rows = records.slice(1).map((values, index) => {
    if (values.length > headers.length) {
      throw new CsvError(`Row ${index + 2} has more values than headers.`)
    }
    return {
      rowNumber: index + 2,
      values: headers.map((_, column) => values[column] ?? ''),
    }
  })

  return { headers, rows }
}

export function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  // Prevent spreadsheet formula execution in exports of untrusted labels.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`
  return safe
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return (
    [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join(
      '\r\n',
    ) + '\r\n'
  )
}
