// Daily reminder tests: the decision logic, plus a full sendDailyReminders()
// run against a fake sheet and a fake Twilio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const FILES = ['Config.js', 'Stats.js', 'Banter.js', 'Reminders.js', 'Broadcast.js', 'WeeklySummary.js', 'DailyReminder.js']
const plain = (value) => JSON.parse(JSON.stringify(value))

function load(globals = {}) {
  const context = vm.createContext({ Date, console: { log() {}, warn() {}, error() {} }, ...globals })
  for (const file of FILES) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file })
  }
  return context
}

const gs = load()
// Top-level consts (BANTER, MAPTAP) aren't properties of the VM context.
const reminderLines = vm.runInContext('BANTER.reminder', gs)
const PLAYERS = ['Henry', 'Max', 'Rob', 'Tom']
const contact = (name, phone, extra = {}) => ({ name, email: '', phone, optedIn: true, pausedUntil: null, ...extra })
const baseInput = (overrides = {}) => ({
  todayKey: '2026-10-20',
  players: PLAYERS,
  todayScores: { Henry: 912, Max: null, Rob: null, Tom: 950 },
  contacts: [contact('Henry', '07700 900001'), contact('Max', '07700 900002'), contact('Rob', '07700 900003'), contact('Tom', '07700 900004')],
  remindedToday: [],
  textsThisMonth: 0,
  maxPerRun: 6,
  maxPerMonth: 40,
  formUrl: '',
  random: () => 0,
  ...overrides,
})

test('UK mobiles in any common format become +447..., anything else is refused', () => {
  for (const typed of ['07700 900123', '+44 7700 900123', '447700900123', '0044 7700-900123', 7700900123, '(07700) 900 123']) {
    assert.equal(gs.normaliseUkMobile_(typed), '+447700900123', String(typed))
  }
  for (const bad of ['', null, '0207 946 0000', '07000 123456', '07624 123456', '+1 202 555 0123', '0770090012', 'call me']) {
    assert.equal(gs.normaliseUkMobile_(bad), null, String(bad))
  }
  assert.equal(gs.maskPhone_('+447700900123'), '+447******123')
})

test('only texts opted-in players with no score today', () => {
  const plan = gs.planReminders_(baseInput())
  assert.deepEqual(plain(plan.texts.map(t => [t.name, t.phone])), [['Max', '+447700900002'], ['Rob', '+447700900003']])
  assert.equal(plan.alert, null)
  assert.match(plan.texts[0].body, /^MapTap reminder: no score from you yet today\. Tick tock, Max\./)
})

test('pause, opt-out, already reminded, bad numbers and duplicates are skipped with a reason', () => {
  const plan = gs.planReminders_(baseInput({
    todayScores: { Henry: null, Max: null, Rob: null, Tom: 950 },
    contacts: [
      contact('Henry', '07700 900001', { pausedUntil: '2026-10-25' }),
      contact('Max', '07700 900002', { optedIn: false }),
      contact('Rob', '0207 946 0000'),
      contact('Rob', '07700 900003'),
      contact('Rob', '07700 900003'),
      contact('Will', '07700 900005'),
    ],
    remindedToday: [],
  }))
  assert.deepEqual(plain(plan.texts.map(t => t.name)), ['Rob'])
  assert.deepEqual(plain(plan.notes), [
    { name: 'Henry', reason: 'paused until Sun 25 Oct' },
    { name: 'Rob', reason: "phone number isn't a UK mobile" },
    { name: 'Rob', reason: 'listed twice on Contacts' },
    { name: 'Will', reason: 'not a player in Sheet1' },
  ])
  const reminded = gs.planReminders_(baseInput({ remindedToday: ['Max'] }))
  assert.deepEqual(plain(reminded.texts.map(t => t.name)), ['Rob'])
  const pauseOver = gs.planReminders_(baseInput({ contacts: [contact('Max', '07700 900002', { pausedUntil: '2026-10-19' })] }))
  assert.equal(pauseOver.texts.length, 1)
})

test('suspicious days email the owner instead of texting', () => {
  const noRow = gs.planReminders_(baseInput({ todayScores: null }))
  assert.equal(noRow.texts.length, 0)
  assert.match(noRow.alert, /no row for Tue 20 Oct/)

  const nobody = gs.planReminders_(baseInput({ todayScores: { Henry: null, Max: null, Rob: null, Tom: null } }))
  assert.equal(nobody.texts.length, 0)
  assert.match(nobody.alert, /Nobody has a score/)

  const tooMany = gs.planReminders_(baseInput({ maxPerRun: 1 }))
  assert.equal(tooMany.texts.length, 0)
  assert.match(tooMany.alert, /more than MAX_TEXTS_PER_RUN/)
})

test('monthly cap sends what fits and alerts', () => {
  const plan = gs.planReminders_(baseInput({ textsThisMonth: 39 }))
  assert.deepEqual(plain(plan.texts.map(t => t.name)), ['Max'])
  assert.deepEqual(plain(plan.notes), [{ name: 'Rob', reason: 'monthly text limit reached' }])
  assert.match(plan.alert, /limit of 40 texts/)
  assert.equal(gs.planReminders_(baseInput({ textsThisMonth: 40 })).texts.length, 0)
})

test('every reminder line fits in one plain SMS, even with a long name and a link', () => {
  const url = 'https://maptap-scores.netlify.app'
  reminderLines.forEach((line, i) => {
    const body = gs.buildReminderText_('Christopher', url, () => i / reminderLines.length)
    assert.ok(body.includes(line.replace('{name}', 'Christopher')), `line ${i} was dropped: ${body}`)
    assert.ok(gs.fitsOneSms_(body), body)
  })
  assert.equal(gs.fitsOneSms_('Emoji 🤡 costs double'), false)
  assert.equal(gs.fitsOneSms_('Curly ’quote’'), false)
  assert.equal(gs.fitsOneSms_('x'.repeat(161)), false)
})

// --- End to end with fake Google services and a fake Twilio ---

const londonKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date)

function fakeWorld({ todayScores, contacts, logRows = [] }) {
  const today = londonKey(new Date())
  const [y, m, d] = today.split('-').map(Number)
  const sheets = {
    Sheet1: [['', ...PLAYERS], [new Date(Date.UTC(y, m - 1, d, 12)), ...PLAYERS.map(p => todayScores[p] ?? '')]],
    Contacts: [['Name', 'Email', 'Phone', 'Weekly Summary', 'Daily Reminder', 'Paused Until'], ...contacts],
    'Broadcast Log': [['Time', 'Broadcast', 'Channel', 'Status', 'Recipients', 'Details'], ...logRows],
  }
  const requests = []
  const emails = []
  const fakeSheet = (rows) => ({ getDataRange: () => ({ getValues: () => rows }), appendRow: (row) => rows.push(row) })
  const world = load({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => (sheets[name] ? fakeSheet(sheets[name]) : null),
        getSpreadsheetTimeZone: () => 'Europe/London',
      }),
    },
    Utilities: {
      formatDate: (date, tz, pattern) => {
        assert.equal(pattern, 'yyyy-MM-dd')
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date)
      },
      base64Encode: (text) => Buffer.from(text).toString('base64'),
    },
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (key) => ({ TWILIO_ACCOUNT_SID: 'AC123', TWILIO_API_KEY_SID: 'SK456', TWILIO_API_KEY_SECRET: 'shh' })[key],
      }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        requests.push({ url, options })
        return { getResponseCode: () => 201, getContentText: () => JSON.stringify({ sid: 'SM' + requests.length }) }
      },
    },
    MailApp: { sendEmail: (...args) => emails.push(args) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'tom@example.com' }) },
  })
  return { world, sheets, requests, emails, today }
}

test('sendDailyReminders texts through Twilio, logs each text, and never double-texts', () => {
  const { world, sheets, requests } = fakeWorld({
    todayScores: { Henry: 912, Tom: 950 },
    contacts: [['Max', '', '07700 900002', true, true, ''], ['Rob', '', '7700900003', true, true, ''], ['Henry', '', '07700 900001', true, true, '']],
  })
  world.sendDailyReminders()

  assert.equal(requests.length, 2)
  const [first] = requests
  assert.equal(first.url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
  assert.equal(first.options.method, 'post')
  assert.equal(first.options.headers.Authorization, 'Basic ' + Buffer.from('SK456:shh').toString('base64'))
  assert.deepEqual(plain(first.options.payload), {
    To: '+447700900002',
    From: 'MapTap',
    Body: first.options.payload.Body,
    ValidityPeriod: '7200',
  })
  assert.match(first.options.payload.Body, /^MapTap reminder: /)

  const sent = sheets['Broadcast Log'].slice(1).filter(row => row[3] === 'SENT')
  assert.deepEqual(sent.map(row => [row[1], row[2], row[4], row[5]]), [
    ['Daily Reminder', 'sms', 'Max', 'SM1 to +447******002'],
    ['Daily Reminder', 'sms', 'Rob', 'SM2 to +447******003'],
  ])

  world.sendDailyReminders() // e.g. trigger fires twice, or someone runs it by hand
  assert.equal(requests.length, 2)
  assert.match(sheets['Broadcast Log'].at(-1)[5], /Max: already reminded today; Rob: already reminded today/)
})

test('monthly count includes earlier texts in the log', () => {
  const now = new Date()
  const earlier = Array.from({ length: 40 }, () => [now, 'Daily Reminder', 'sms', 'SENT', 'Someone', ''])
  const { world, requests, emails } = fakeWorld({
    todayScores: { Henry: 912 },
    contacts: [['Max', '', '07700 900002', true, true, '']],
    logRows: earlier,
  })
  world.sendDailyReminders()
  assert.equal(requests.length, 0)
  assert.equal(emails.length, 1)
  assert.match(emails[0][2], /limit of 40 texts/)
})

test('a Twilio error is logged and the run fails so Google emails you', () => {
  const { world, sheets } = fakeWorld({ todayScores: { Henry: 912 }, contacts: [['Max', '', '07700 900002', true, true, '']] })
  world.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 400,
    getContentText: () => JSON.stringify({ code: 21211, message: "Invalid 'To' Phone Number" }),
  })
  assert.throws(() => world.sendDailyReminders(), /Some reminders failed: Max: Twilio error 21211/)
  assert.deepEqual(plain(sheets['Broadcast Log'].at(-1).slice(3, 6)), ['FAILED', 'Max', "Twilio error 21211: Invalid 'To' Phone Number"])
})

test('switched off in Config means nothing is sent', () => {
  const { world, requests } = fakeWorld({ todayScores: { Henry: 912 }, contacts: [['Max', '', '07700 900002', true, true, '']] })
  vm.runInContext('MAPTAP.REMINDERS_ENABLED = false', world)
  world.sendDailyReminders()
  assert.equal(requests.length, 0)
})
