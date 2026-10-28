import { describe, expect, it } from 'vitest'
import { CsvError, csvEscape, parseCsv, toCsv } from '../../src/domain/csv'

describe('parseCsv', () => {
  it('parses headers, quoted commas, escaped quotes, CRLF, and a BOM', () => {
    const parsed = parseCsv(
      '\uFEFFslug,destination_url,note\r\nlaunch,https://example.com/a,"Hello, ""world"""\r\n',
    )
    expect(parsed.headers).toEqual(['slug', 'destination_url', 'note'])
    expect(parsed.rows).toEqual([{ rowNumber: 2, values: ['launch', 'https://example.com/a', 'Hello, "world"'] }])
  })

  it('supports quoted multiline fields and pads short rows', () => {
    const parsed = parseCsv('slug,destination_url\nlaunch,https://example.com\n"a\nb",https://example.com/b\n')
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 2 })
    expect(parsed.rows[1]).toEqual({
      rowNumber: 3,
      values: ['a\nb', 'https://example.com/b'],
    })
    const short = parseCsv('slug,destination_url,note\nlaunch,https://example.com\n')
    expect(short.rows[0]!.values).toEqual(['launch', 'https://example.com', ''])
  })

  it('rejects empty, header-only, duplicate-header, and ragged input', () => {
    expect(() => parseCsv('')).toThrow(CsvError)
    expect(() => parseCsv('slug,destination_url\n')).toThrow(/at least one data row/)
    expect(() => parseCsv('slug,SLUG\nlaunch,x\n')).toThrow(/unique/)
    expect(() => parseCsv('slug,destination_url\nlaunch,https://example.com,extra\n')).toThrow(/more values/)
    expect(() => parseCsv('slug,\nlaunch,x\n')).toThrow(/header/)
  })

  it('rejects unclosed quotes and text after a closing quote', () => {
    expect(() => parseCsv('slug,note\nlaunch,"unclosed\n')).toThrow(/inside a quoted field/)
    expect(() => parseCsv('slug,note\nlaunch,"ok"junk\n')).toThrow(/after a closing quote/)
    expect(() => parseCsv('slug,note\nlaunch,un"quoted\n')).toThrow(/Unexpected quote/)
  })

  it('enforces row and byte limits', () => {
    expect(() => parseCsv('slug,dest\na,b\nc,d\n', { maxRows: 1 })).toThrow(/at most 1 rows/)
    expect(() => parseCsv('slug,dest\nlaunch,https://example.com\n', { maxBytes: 5 })).toThrow(/smaller/)
  })
})

describe('CSV output', () => {
  it('quotes separators and escapes quotes', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"')
    expect(csvEscape(null)).toBe('')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvEscape('=HYPERLINK("https://evil")')).toBe('"\'=HYPERLINK(""https://evil"")"')
    expect(csvEscape('+1')).toBe("'+1")
    expect(csvEscape('-1')).toBe("'-1")
    expect(csvEscape('@cmd')).toBe("'@cmd")
  })

  it('writes CRLF rows with a trailing newline', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n')
  })
})
