/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  parseLegacyGoogleSheetsRange,
  resolveGoogleSheetsV2RangeParams,
} from '@/tools/google_sheets/range'

describe('parseLegacyGoogleSheetsRange', () => {
  it('splits sheet name and cell range', () => {
    expect(parseLegacyGoogleSheetsRange('channel_accounts!A2:B')).toEqual({
      sheetName: 'channel_accounts',
      cellRange: 'A2:B',
    })
  })

  it('handles quoted sheet names', () => {
    expect(parseLegacyGoogleSheetsRange("'Sheet1'!A1")).toEqual({
      sheetName: 'Sheet1',
      cellRange: 'A1',
    })
  })

  it('handles sheet-only values', () => {
    expect(parseLegacyGoogleSheetsRange('Summary')).toEqual({
      sheetName: 'Summary',
    })
  })
})

describe('resolveGoogleSheetsV2RangeParams', () => {
  it('reads legacy range when sheetName is missing', () => {
    expect(
      resolveGoogleSheetsV2RangeParams({
        range: 'Sheet1!A6:Z',
      })
    ).toEqual({
      sheetName: 'Sheet1',
      cellRange: 'A6:Z',
    })
  })

  it('splits combined cellRange values', () => {
    expect(
      resolveGoogleSheetsV2RangeParams({
        sheetName: 'Sheet1',
        cellRange: 'Sheet1!A2:B',
      })
    ).toEqual({
      sheetName: 'Sheet1',
      cellRange: 'A2:B',
    })
  })
})
