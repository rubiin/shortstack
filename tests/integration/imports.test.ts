import { describe, expect, it } from 'vitest'

import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/authz'
import { getDb } from '../../src/server/db'
import {
  applySuggestedSlugs,
  commitImport,
  createImportBatch,
  getImportBatch,
  previewImport,
  setImportRowExcluded,
  updateImportRow,
} from '../../src/server/imports'
import { ensureDailyMaintenanceJob } from '../../src/server/jobs'
import { runWorker } from '../../src/server/worker'
import { insertLink, seedWorkspace } from '../helpers'

const csv = [
  'slug,destination_url,campaign,note,expires_at,enabled',
  'spring-launch,https://example.com/a,Spring,hero,2026-12-31,true',
  'spring-launch,https://example.com/b,Spring,,,',
  'bad!,https://example.com/c,Spring,,,',
  'existing,https://example.com/d,Spring,,,',
  'paused,https://example.com/e,Spring,,2026-11-01,false',
].join('\n')

describe('CSV import', () => {
  it('previews, resolves duplicates, excludes invalid rows, and creates links', () => {
    const fixture = seedWorkspace()
    insertLink(fixture, { slug: 'existing' })
    const { batchId } = createImportBatch({ user: fixture.user, csv, filename: 'spring.csv' })
    const draft = getImportBatch(fixture.workspaceId, batchId)
    expect(draft.status).toBe('draft')
    expect(draft.totalRows).toBe(5)
    expect(draft.mapping).toMatchObject({
      slug: 'slug',
      destination_url: 'destination_url',
      campaign: 'campaign',
      note: 'note',
      expires_at: 'expires_at',
      enabled: 'enabled',
    })
    expect(draft.rows).toHaveLength(0)

    const previewed = previewImport({ user: fixture.user, batchId, mapping: draft.mapping })
    expect(previewed.status).toBe('previewed')
    expect(previewed.validRows).toBe(2)
    expect(previewed.invalidRows).toBe(3)
    const rows = new Map(previewed.rows.map((row) => [row.rowNumber, row]))
    expect(rows.get(2)).toMatchObject({ slug: 'spring-launch', status: 'valid', enabled: true })
    expect(rows.get(3)!.status).toBe('duplicate')
    expect(rows.get(3)!.suggestedSlug).toBe('spring-launch-2')
    expect(rows.get(4)!.status).toBe('invalid')
    expect(rows.get(4)!.errors[0]!.field).toBe('slug')
    expect(rows.get(5)!.status).toBe('duplicate')
    expect(rows.get(5)!.suggestedSlug).toBe('existing-2')
    expect(rows.get(6)).toMatchObject({ slug: 'paused', status: 'valid', enabled: false })

    const withSuggestion = applySuggestedSlugs({ user: fixture.user, batchId })
    const fixed = withSuggestion.rows.find((row) => row.rowNumber === 3)!
    expect(fixed.slug).toBe('spring-launch-2')
    expect(fixed.status).toBe('valid')

    const withoutInvalid = setImportRowExcluded({
      user: fixture.user,
      batchId,
      rowId: rows.get(4)!.id,
      excluded: true,
    })
    expect(withoutInvalid.validRows).toBe(4)
    expect(withoutInvalid.invalidRows).toBe(0)
    expect(withoutInvalid.rows.find((row) => row.rowNumber === 4)!.status).toBe('excluded')

    const edited = updateImportRow({
      user: fixture.user,
      batchId,
      rowId: rows.get(6)!.id,
      values: { note: 'Edited before commit' },
    })
    expect(edited.rows.find((row) => row.rowNumber === 6)!.note).toBe('Edited before commit')

    const result = commitImport({
      user: fixture.user,
      batchId,
      commitToken: edited.commitToken,
    })
    expect(result.alreadyCompleted).toBe(false)
    expect(result.links.map((link) => link.slug).sort()).toEqual([
      'existing-2',
      'paused',
      'spring-launch',
      'spring-launch-2',
    ])
    const db = getDb()
    expect(
      (
        db
          .prepare('SELECT count(*) AS n FROM short_links WHERE import_batch_id = ?')
          .get(batchId) as { n: number }
      ).n,
    ).toBe(4)
    const paused = db.prepare("SELECT enabled FROM short_links WHERE slug = 'paused'").get() as {
      enabled: number
    }
    expect(paused.enabled).toBe(0)
    const campaign = db.prepare("SELECT id FROM campaigns WHERE name = 'Spring'").get() as {
      id: string
    }
    expect(campaign.id).toBeTruthy()

    const completed = getImportBatch(fixture.workspaceId, batchId)
    expect(completed.status).toBe('completed')
    expect(completed.createdLinks).toHaveLength(4)
  })

  it('rejects a stale commit token and a second concurrent commit', () => {
    const fixture = seedWorkspace()
    const { batchId } = createImportBatch({
      user: fixture.user,
      csv: 'slug,destination_url\none,https://example.com/one\ntwo,https://example.com/two\n',
    })
    const draft = getImportBatch(fixture.workspaceId, batchId)
    const previewed = previewImport({ user: fixture.user, batchId, mapping: draft.mapping })
    expect(() => commitImport({ user: fixture.user, batchId, commitToken: 'wrong-token' })).toThrow(
      ConflictError,
    )

    const first = commitImport({ user: fixture.user, batchId, commitToken: previewed.commitToken })
    expect(first.links).toHaveLength(2)
    const second = commitImport({ user: fixture.user, batchId, commitToken: previewed.commitToken })
    expect(second.alreadyCompleted).toBe(true)
    expect(second.links).toHaveLength(2)
  })

  it('refuses to preview an empty mapping or a batch from another workspace', () => {
    const fixture = seedWorkspace()
    const { batchId } = createImportBatch({
      user: fixture.user,
      csv: 'slug,destination_url\nlaunch,https://example.com',
    })
    expect(() => previewImport({ user: fixture.user, batchId, mapping: {} })).toThrow(
      ValidationError,
    )

    const other = seedWorkspace({
      workspaceId: 'ws_other',
      userId: 'usr_other',
      domainId: 'dom_other',
      campaignId: 'cmp_other',
      hostname: 'other.test',
    })
    expect(() => getImportBatch(other.workspaceId, batchId)).toThrow(NotFoundError)
  })

  it('clears raw CSV after retention while keeping rows and created links', async () => {
    const fixture = seedWorkspace()
    const { batchId } = createImportBatch({
      user: fixture.user,
      csv: 'slug,destination_url,note\nforever,https://example.com/forever,private note\n',
    })
    const draft = getImportBatch(fixture.workspaceId, batchId)
    const previewed = previewImport({ user: fixture.user, batchId, mapping: draft.mapping })
    const result = commitImport({ user: fixture.user, batchId, commitToken: previewed.commitToken })
    const db = getDb()
    db.prepare('UPDATE import_batches SET raw_expires_at = ? WHERE id = ?').run(
      '2020-01-01T00:00:00.000Z',
      batchId,
    )

    ensureDailyMaintenanceJob()
    await runWorker({ once: true })

    const batch = db
      .prepare('SELECT raw_csv, mapping_json FROM import_batches WHERE id = ?')
      .get(batchId) as {
      raw_csv: string | null
      mapping_json: string | null
    }
    expect(batch.raw_csv).toBeNull()
    expect(batch.mapping_json).toBeNull()
    const rows = db
      .prepare('SELECT raw_json, created_link_id FROM import_rows WHERE batch_id = ?')
      .all(batchId) as Array<{
      raw_json: string
      created_link_id: string | null
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.raw_json).toBe('{}')
    expect(rows[0]!.created_link_id).toBe(result.links[0]!.id)
    expect(
      db.prepare('SELECT count(*) AS n FROM short_links WHERE id = ?').get(result.links[0]!.id),
    ).toMatchObject({ n: 1 })
    expect(getImportBatch(fixture.workspaceId, batchId)).toMatchObject({ rawExpired: true })
    expect(() => previewImport({ user: fixture.user, batchId, mapping: draft.mapping })).toThrow(
      /already been created/,
    )
  })
})
