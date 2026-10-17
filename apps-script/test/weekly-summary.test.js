// Runs the Apps Script stats/email code under Node. Apps Script puts every
// file in one global scope, so load them all into one shared VM context.
//   npm run test:apps-script
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const gs = vm.createContext({})
for (const file of ['Config.js', 'Stats.js', 'Banter.js', 'WeeklyEmail.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), gs, { filename: file })
}

const POINTS = [10, 7, 5, 3, 2, 1, 0, 0]
const PLAYERS = ['Henry', 'Max', 'Nathan', 'Rob', 'Sean', 'Simon', 'Tom', 'Will']

// Sheet1 rows 330-340 (October 2026)
const SHEET1 = {
  '2026-10-04': [905, 910, 655, 898, 824, 891, 941, 942],
  '2026-10-05': [907, 914, 917, 922, 915, 878, 904, 916],
  '2026-10-06': [960, 927, 911, 928, 919, 932, 918, 924],
  '2026-10-07': [865, 810, 882, 877, 881, 936, 831, 862],
  '2026-10-08': [893, 927, 905, 997, 919, 931, 936, 972],
  '2026-10-09': [945, 936, 915, 932, 944, 896, 885, 931],
  '2026-10-10': [937, 932, 892, 944, 871, 887, 930, 878],
  '2026-10-11': [814, 946, 865, 924, 940, 831, 977, 840],
  '2026-10-12': [952, 951, 950, 959, 961, 834, 954, 957],
  '2026-10-13': [965, 981, null, 954, 974, 957, 908, 884],
  '2026-10-14': [930, 968, 913, 970, 969, 979, 967, 955],
}

// The October leaderboard tab's running totals
const RUNNING_TOTALS = {
  '2026-10-03': [17, 5, 9, 21, 10, 7, 3, 12],
  '2026-10-04': [20, 10, 9, 23, 10, 8, 10, 22],
  '2026-10-05': [21, 12, 16, 33, 13, 8, 10, 27],
  '2026-10-06': [31, 15, 16, 38, 14, 15, 10, 29],
  '2026-10-07': [33, 15, 23, 41, 19, 25, 10, 30],
  '2026-10-08': [33, 17, 23, 51, 20, 28, 15, 37],
  '2026-10-09': [43, 22, 24, 54, 27, 28, 15, 39],
  '2026-10-10': [50, 27, 26, 64, 27, 29, 18, 39],
  '2026-10-11': [50, 34, 28, 67, 32, 29, 28, 40],
  '2026-10-12': [52, 35, 28, 74, 42, 29, 31, 45],
  '2026-10-13': [57, 45, 28, 76, 49, 32, 32, 45],
  '2026-10-14': [57, 48, 28, 83, 54, 42, 34, 46],
}

// Arrays made inside the VM context fail deepEqual's prototype check, so copy them out.
const plain = value => JSON.parse(JSON.stringify(value))
const toDay = values => Object.fromEntries(PLAYERS.map((name, i) => [name, values[i]]))
const data = {
  players: PLAYERS,
  days: Object.fromEntries(Object.entries(SHEET1).map(([day, values]) => [day, toDay(values)])),
}

test('daily points match the leaderboard running totals', () => {
  for (const day of Object.keys(SHEET1)) {
    const previous = RUNNING_TOTALS[gs.addDays_(day, -1)]
    const expected = toDay(RUNNING_TOTALS[day].map((total, i) => total - previous[i]))
    const points = gs.pointsForDay_(data.days[day], POINTS)
    for (const name of PLAYERS) {
      assert.equal(points[name] ?? 0, expected[name], `${name} on ${day}`)
    }
  }
})

test('ties share the higher rank', () => {
  const points = gs.pointsForDay_({ A: 950, B: 950, C: 900, D: null }, POINTS)
  assert.deepEqual(plain(points), { A: 10, B: 10, C: 5 })
})

test('week dates run Monday to Sunday', () => {
  assert.equal(gs.weekEndingOnOrBefore_('2026-10-14'), '2026-10-11') // Wednesday
  assert.equal(gs.weekEndingOnOrBefore_('2026-10-18'), '2026-10-18') // Sunday
  assert.equal(gs.parseDateText_('5/10/2026'), '2026-10-05')
  assert.equal(gs.formatDay_('2026-10-05'), 'Mon 5 Oct')
  assert.equal(gs.monthEnd_('2026-12-15'), '2026-12-31')
  assert.equal(gs.monthEnd_('2028-02-10'), '2028-02-29')
})

test('weekly stats for 5-11 Oct', () => {
  const stats = gs.computeWeeklyStats_(data, '2026-10-11', POINTS)
  const pointsByName = Object.fromEntries(stats.standings.map(p => [p.name, p.points]))
  const expected = toDay(RUNNING_TOTALS['2026-10-11'].map((total, i) => total - RUNNING_TOTALS['2026-10-04'][i]))
  assert.deepEqual(pointsByName, expected)

  assert.deepEqual(plain(stats.winners.map(p => p.name)), ['Rob'])
  assert.deepEqual(plain(stats.woodenSpoons.map(p => p.name).sort()), ['Tom', 'Will'])
  assert.deepEqual(plain(stats.highest.map(e => [e.name, e.score, e.day])), [['Rob', 997, '2026-10-08']])
  assert.deepEqual(plain(stats.lowest.map(e => [e.name, e.score, e.day])), [['Max', 810, '2026-10-07']])
  assert.equal(stats.noShows.length, 0)
  assert.equal(stats.stillToPlay.length, 0)
  // Only 04/10 of the previous week is in the test data, so Nathan (655 that day) is "most improved".
  assert.equal(stats.mostImproved.name, 'Nathan')
})

test('forgotten days get a clown; a missing Sunday score gets an alarm clock instead', () => {
  const days = { ...data.days }
  days['2026-10-07'] = { ...days['2026-10-07'], Will: null }
  days['2026-10-11'] = { ...days['2026-10-11'], Henry: null }
  const stats = gs.computeWeeklyStats_({ ...data, days }, '2026-10-11', POINTS)
  assert.deepEqual(plain(stats.noShows.map(p => [p.name, p.forgotten])), [['Will', ['2026-10-07']]])
  assert.deepEqual(plain(stats.stillToPlay.map(p => p.name)), ['Henry'])
  const henry = stats.standings.find(p => p.name === 'Henry')
  assert.equal(henry.played, 6)
  assert.equal(henry.average, (907 + 960 + 865 + 893 + 945 + 937) / 6)

  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.match(email.text, /Will 🤡: /)
  assert.match(email.text, /Henry ⏰: /)
  assert.match(email.text, /Hall of shame: Will forgot Wed 7 Oct/)
  assert.match(email.text, /No score yet for Sun 11 Oct from Henry/)
  assert.match(email.text, /🤡 = a day you forgot to play/)
})

test('a week still in progress only counts days so far', () => {
  // Previewing the week ending Sun 18 Oct on Wed 14 Oct.
  const stats = gs.computeWeeklyStats_(data, '2026-10-18', POINTS, '2026-10-14')
  const pointsByName = Object.fromEntries(stats.standings.map(p => [p.name, p.points]))
  const expected = toDay(RUNNING_TOTALS['2026-10-14'].map((total, i) => total - RUNNING_TOTALS['2026-10-11'][i]))
  assert.deepEqual(pointsByName, expected)
  assert.deepEqual(plain(stats.noShows.map(p => [p.name, p.forgotten.length])), [['Nathan', 1]]) // 13 Oct only
  assert.equal(stats.stillToPlay.length, 0) // everyone has a score for the 14th
  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.match(email.text, /Mon 12 Oct – Sun 18 Oct \(so far, up to Wed 14 Oct\)/)
})

test('month leaderboard matches the running totals, with movement since last week', () => {
  // Sheet1 data here starts on 4 Oct, so compare against totals minus 3 Oct's.
  const stats = gs.computeWeeklyStats_(data, '2026-10-18', POINTS, '2026-10-14')
  assert.equal(stats.months.length, 1)
  const october = stats.months[0]
  assert.equal(october.isFinal, false)
  const points = Object.fromEntries(october.standings.map(p => [p.name, p.points]))
  const expected = toDay(RUNNING_TOTALS['2026-10-14'].map((total, i) => total - RUNNING_TOTALS['2026-10-03'][i]))
  assert.deepEqual(points, expected)
  assert.equal(october.standings[0].name, 'Rob')
  const movement = Object.fromEntries(october.standings.map(p => [p.name, p.movement]))
  assert.equal(movement.Sean, 4) // 6th= after 11 Oct, 2nd by 14 Oct
  assert.equal(movement.Henry, -2) // 2nd -> 4th
  assert.equal(movement.Rob, 0)
  assert.deepEqual(plain(october.standings.find(p => p.name === 'Nathan').forgotten), ['2026-10-13'])

  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.match(email.text, /OCTOBER LEADERBOARD \(UP TO WED 14 OCT\)\n1\. Rob: 62 pts =/)
  assert.match(email.text, /Sean: 44 pts ▲4/)
  assert.match(email.text, /Nathan 🤡: 19 pts/)
})

test('a week crossing into a new month shows the old month\'s final table', () => {
  const days = {}
  for (const day of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
    days[day] = { Ann: 950, Bob: 900 }
  }
  days['2026-11-01'] = { Ann: 800, Bob: 900 }
  const stats = gs.computeWeeklyStats_({ players: ['Ann', 'Bob'], days }, '2026-11-01', POINTS)
  assert.deepEqual(plain(stats.months.map(m => [m.monthKey, m.isFinal])), [['2026-10-01', true], ['2026-11-01', false]])
  assert.deepEqual(plain(stats.months[1].standings.map(p => [p.name, p.points])), [['Bob', 10], ['Ann', 7]])
  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.equal(email.subject, '🎯 MapTap weekly: Ann wins the week · Ann wins October')
  assert.match(email.text, /OCTOBER LEADERBOARD \(FINAL\)/)
  assert.match(email.text, /NOVEMBER LEADERBOARD \(UP TO SUN 1 NOV\)/)
})

test('a week with no scores is flagged so nothing is sent', () => {
  const stats = gs.computeWeeklyStats_(data, '2026-11-01', POINTS)
  assert.equal(stats.hasScores, false)
})

test('email renders every section', () => {
  const stats = gs.computeWeeklyStats_(data, '2026-10-11', POINTS)
  const email = gs.buildWeeklyEmail_(stats, () => 0)
  assert.equal(email.subject, '🎯 MapTap weekly: Rob wins the week · Rob leads October')
  assert.match(email.text, /Mon 5 Oct – Sun 11 Oct/)
  assert.match(email.text, /1\. Rob: 44 pts/)
  assert.match(email.text, /Wooden spoon: Tom & Will on 18 pts/)
  assert.match(email.text, /Highest score: Rob with 997 \(Thu 8 Oct\)/)
  assert.match(email.html, /<table/)
  assert.doesNotMatch(email.text + email.html, /undefined|NaN|\{name\}/)
})
