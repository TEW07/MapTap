// Midnight penalty tests: who gets penalised, the full run against a fake
// sheet, and how penalties show up in the weekly stats and email.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const FILES = ['Config.js', 'ScoreUpdater.js', 'Stats.js', 'Banter.js', 'WeeklyEmail.js', 'Reminders.js',
  'Penalties.js', 'Broadcast.js', 'WeeklySummary.js', 'DailyReminder.js', 'DailyPenalty.js']
const plain = (value) => JSON.parse(JSON.stringify(value))

function load(globals = {}) {
  const context = vm.createContext({ Date, console: { log() {}, warn() {}, error() {} }, ...globals })
  for (const file of FILES) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file })
  }
  return context
}

const gs = load()
const PLAYERS = ['Henry', 'Max', 'Rob', 'Tom']
const planInput = (overrides = {}) => ({
  dayKey: '2026-11-03',
  startKey: '2026-11-01',
  players: PLAYERS,
  dayScores: { Henry: 912, Max: null, Rob: null, Tom: 950 },
  contacts: [],
  ...overrides,
})

test('penalises blanks, skips paused players, played and already-penalised', () => {
  const plan = gs.planPenalties_(planInput({
    dayScores: { Henry: 912, Max: null, Rob: null, Tom: -10 },
    contacts: [{ name: 'Rob', pausedUntil: '2026-11-03' }, { name: 'Max', pausedUntil: '2026-11-02' }],
  }))
  assert.deepEqual(plain(plan.penalise), ['Max'])
  assert.deepEqual(plain(plan.exempt), [{ name: 'Rob', reason: 'paused until Tue 3 Nov' }])
  assert.equal(plan.alert, null)
})

test('nothing before the start date; missing row or nobody played alerts instead', () => {
  assert.match(gs.planPenalties_(planInput({ dayKey: '2026-10-31' })).skip, /start on Sun 1 Nov/)
  assert.match(gs.planPenalties_(planInput({ dayScores: null })).alert, /no row for Tue 3 Nov/)
  const nobody = gs.planPenalties_(planInput({ dayScores: { Henry: null, Max: null, Rob: null, Tom: null } }))
  assert.match(nobody.alert, /Nobody has a score/)
  assert.equal(nobody.penalise.length, 0)
})

test('a penalty is worth its own value and is not ranked', () => {
  const points = gs.pointsForDay_({ A: 950, B: -10, C: 900, D: null }, [10, 7, 5, 3, 2, 1, 0, 0])
  assert.deepEqual(plain(points), { A: 10, C: 7, B: -10 })
})

test('weekly stats: penalty counts in points, not in averages or lowest score', () => {
  const days = {}
  const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
  week.forEach((day) => { days[day] = { Henry: 900, Max: 950, Rob: 800, Tom: 850 } })
  days['2026-11-04'] = { Henry: 900, Max: 950, Rob: -10, Tom: 850 }
  const stats = gs.computeWeeklyStats_({ players: PLAYERS, days }, '2026-11-08', [10, 7, 5, 3, 2, 1, 0, 0])
  const rob = stats.standings.find((p) => p.name === 'Rob')
  assert.equal(rob.points, 6 * 3 - 10)
  assert.equal(rob.average, 800)
  assert.equal(rob.played, 6)
  assert.deepEqual(plain(rob.forgotten), ['2026-11-04'])
  assert.deepEqual(plain(stats.lowest.map((e) => e.score)), [800, 800, 800, 800, 800, 800])
  // Other players' points are unaffected: Tom is 3rd every day either way.
  assert.equal(stats.standings.find((p) => p.name === 'Tom').points, 7 * 5)
  assert.equal(stats.months[0].standings.find((p) => p.name === 'Rob').points, 8)

  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.match(email.text, /Rob 🤡: 8 pts/)
  assert.match(email.text, /Hall of shame: Rob forgot Wed 4 Nov \(-10 pts\)\n {3}Minus ten for Rob/)
  assert.doesNotMatch(email.text, /Lowest score: .*-10/)
})

// --- End to end with a fake Sheet1 ---

function fakeWorld({ row, lockedRows = [] }) {
  const sheet1 = [['', ...PLAYERS], [new Date(Date.UTC(2026, 10, 2, 12)), 900, 900, 900, 900], [new Date(Date.UTC(2026, 10, 3, 12)), ...row]]
  const contacts = [['Name', 'Email', 'Phone', 'Weekly Summary', 'Daily Reminder', 'Paused Until'], ['Rob', '', '', true, true, '']]
  const log = [['Time', 'Broadcast', 'Channel', 'Status', 'Recipients', 'Details']]
  const protections = lockedRows.map((r) => fakeProtection('MapTap lock old', r))
  const emails = []
  function fakeProtection(description, rowNumber) {
    const p = {
      description, rowNumber, removed: false, editors: ['tom@example.com', 'mate@example.com'], domainEdit: true,
      setDescription(d) { p.description = d; return p },
      getDescription: () => p.description,
      getRange: () => ({ getRow: () => p.rowNumber }),
      addEditor() { return p },
      getEditors: () => p.editors,
      removeEditors(list) { p.editors = p.editors.filter((e) => !list.includes(e)); return p },
      canDomainEdit: () => p.domainEdit,
      setDomainEdit(v) { p.domainEdit = v; return p },
      remove() { p.removed = true; protections.splice(protections.indexOf(p), 1) },
    }
    return p
  }
  const sheets = {
    Sheet1: {
      getDataRange: () => ({ getValues: () => sheet1 }),
      getRange: (r, c, rows, cols) => ({
        getValue: () => sheet1[r - 1][c - 1],
        setValue: (v) => { sheet1[r - 1][c - 1] = v },
        protect: () => { assert.deepEqual([c, rows, cols], [1, 1, PLAYERS.length + 1]); const p = fakeProtection('', r); protections.push(p); return p },
      }),
      getProtections: () => protections,
    },
    Contacts: { getDataRange: () => ({ getValues: () => contacts }) },
    'Broadcast Log': { getDataRange: () => ({ getValues: () => log }), appendRow: (r) => log.push(r) },
  }
  const fmt = (date, tz, pattern) => {
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date).split('-')
    return pattern === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`
  }
  const world = load({
    SpreadsheetApp: {
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, getSpreadsheetTimeZone: () => 'Europe/London' }),
    },
    Utilities: { formatDate: fmt },
    MailApp: { sendEmail: (...args) => emails.push(args) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'tom@example.com' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this } }) },
  })
  return { world, sheet1, log, protections, emails }
}

test('applies the penalty, locks the row to the owner, and logs it', () => {
  const { world, sheet1, log, protections } = fakeWorld({ row: [912, '', '', 950] })
  world.runDailyPenalty_('2026-11-03', false)
  assert.deepEqual(sheet1[2].slice(1), [912, -10, -10, 950])
  assert.equal(protections.length, 1)
  assert.equal(protections[0].description, 'MapTap lock 2026-11-03')
  assert.equal(protections[0].rowNumber, 3)
  assert.deepEqual(protections[0].editors, [])
  assert.equal(protections[0].domainEdit, false)
  assert.deepEqual(plain(log.at(-1).slice(1, 6)), ['Midnight Penalty', 'sheet', 'PENALISED', 'Max, Rob', '-10 pts. Tue 3 Nov locked'])

  world.runDailyPenalty_('2026-11-03', false) // run twice: no double penalty, one lock
  assert.deepEqual(sheet1[2].slice(1), [912, -10, -10, 950])
  assert.equal(protections.length, 1)
  assert.equal(log.at(-1)[3], 'LOCKED')
})

test('preview changes nothing', () => {
  const { world, sheet1, log, protections } = fakeWorld({ row: [912, '', '', 950] })
  world.runDailyPenalty_('2026-11-03', true)
  assert.deepEqual(sheet1[2].slice(1), [912, '', '', 950])
  assert.equal(protections.length, 0)
  assert.equal(log.length, 1)
})

test('nobody played: email instead, nothing written or locked', () => {
  const { world, sheet1, protections, emails } = fakeWorld({ row: ['', '', '', ''] })
  world.runDailyPenalty_('2026-11-03', false)
  assert.deepEqual(sheet1[2].slice(1), ['', '', '', ''])
  assert.equal(protections.length, 0)
  assert.equal(emails.length, 1)
})

test('the form refuses submissions for a locked day', () => {
  const { world, sheet1 } = fakeWorld({ row: [912, '', '', 950], lockedRows: [] })
  world.runDailyPenalty_('2026-11-03', false)
  const post = (body) => JSON.parse(world.doPost({ postData: { contents: JSON.stringify(body) } }).text)
  assert.match(post({ name: 'Max', date: '03/11/2026', score: 930 }).error, /closed at midnight/)
  assert.equal(sheet1[2][2], -10)
  assert.equal(post({ name: 'Max', date: '02/11/2026', score: 900 }).success, true) // other days unaffected
})

test('the scheduled test run penalises the stored date and tidies up after itself', () => {
  const { world, sheet1 } = fakeWorld({ row: [912, '', '', 950] })
  const props = { TEST_PENALTY_DATE: '2026-11-03' }
  const deleted = []
  world.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k], deleteProperty: (k) => { delete props[k] } }) }
  world.ScriptApp = {
    getProjectTriggers: () => [{ getHandlerFunction: () => 'runScheduledPenaltyTest' }],
    deleteTrigger: (t) => deleted.push(t.getHandlerFunction()),
  }
  world.runScheduledPenaltyTest()
  assert.deepEqual(sheet1[2].slice(1), [912, -10, -10, 950])
  assert.deepEqual(props, {})
  assert.deepEqual(deleted, ['runScheduledPenaltyTest'])
})
