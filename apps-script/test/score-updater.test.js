// Runs ScoreUpdater.js under Node against a fake Sheet1.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d))

// Header row, last year's 10/11, this year's 10/11, and a date typed as text.
function fakeSheet() {
  return [
    ['', 'Henry', 'Max', 'Will', '', 'Notes'],
    [utc(2025, 11, 10), 900, '', '', '', ''],
    [utc(2026, 11, 10), '', 950, '', '', ''],
    ['9/11/2026', '', '', '', '', ''],
  ]
}

function load(values) {
  const sheet = {
    getDataRange: () => ({ getValues: () => values }),
    getProtections: () => [],
    getRange: (row, col) => ({
      getValue: () => values[row - 1][col - 1],
      setValue: (v) => { values[row - 1][col - 1] = v },
    }),
  }
  const context = vm.createContext({
    Date, // share the test's Date so `instanceof Date` works inside the VM
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: {
      ProtectionType: { RANGE: 'RANGE' },
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => (name === 'Sheet1' ? sheet : null),
        getSpreadsheetTimeZone: () => 'Europe/London',
      }),
    },
    // Test dates are UTC midnight, so formatting the UTC parts is enough here.
    Utilities: {
      formatDate: (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`,
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
    },
  })
  vm.runInContext(readFileSync(new URL('../ScoreUpdater.js', import.meta.url), 'utf8'), context)
  return context
}

const post = (gs, body) => JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(body) } }).text)

test('doGet lists players up to the first blank header', () => {
  const result = JSON.parse(load(fakeSheet()).doGet().text)
  assert.deepEqual(result, { success: true, players: ['Henry', 'Max', 'Will'] })
})

test('writes to this year\'s row, not last year\'s', () => {
  const values = fakeSheet()
  const result = post(load(values), { name: 'Henry', date: '10/11/2026', score: '912' })
  assert.deepEqual(result, { success: true, row: 3, col: 2 })
  assert.equal(values[2][1], 912)
  assert.equal(values[1][1], 900) // 2025 untouched
})

test('matches date cells stored as text, and unpadded dates', () => {
  const values = fakeSheet()
  assert.equal(post(load(values), { name: 'Will', date: '09/11/2026', score: 880 }).success, true)
  assert.equal(values[3][3], 880)
})

test('refuses to overwrite a different score, allows resubmitting the same one', () => {
  const values = fakeSheet()
  const gs = load(values)
  assert.match(post(gs, { name: 'Max', date: '10/11/2026', score: 700 }).error, /Max already has 950/)
  assert.equal(values[2][2], 950)
  assert.equal(post(gs, { name: 'Max', date: '10/11/2026', score: 950 }).success, true)
})

test('clear errors for unknown players, missing rows and bad input', () => {
  const gs = load(fakeSheet())
  assert.match(post(gs, { name: 'Bob', date: '10/11/2026', score: 900 }).error, /"Bob" isn't in the header row/)
  assert.match(post(gs, { name: 'Max', date: '01/12/2026', score: 900 }).error, /no row for 01\/12\/2026/)
  assert.match(post(gs, { name: 'Max', date: 'November 10', score: 900 }).error, /dd\/mm\/yyyy/)
  assert.match(post(gs, { name: 'Max', date: '10/11/2026', score: 'abc' }).error, /whole number/)
})
