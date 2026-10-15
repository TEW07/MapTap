// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMapTapScore } from './parseMapTapScore.js'

const share = (date, score) => `www.maptap.gg ${date}\n99🔥 96🏅 98🔥 98🔥 5😭\nFinal score: ${score}`
const on = (y, m, d) => new Date(y, m - 1, d, 21, 0)

test('parses the standard share text', () => {
  const parsed = parseMapTapScore(share('October 15', 912), on(2026, 10, 15))
  assert.equal(parsed.date, '15/10/2026')
  assert.equal(parsed.finalScore, '912')
})

test('uses the current year, not a hardcoded one', () => {
  assert.equal(parseMapTapScore(share('January 6', 700), on(2027, 1, 6)).date, '06/01/2027')
})

test('a late December score pasted in January belongs to last year', () => {
  assert.equal(parseMapTapScore(share('December 31', 700), on(2027, 1, 1)).date, '31/12/2026')
})

test('allows a day of timezone slack before rolling back a year', () => {
  assert.equal(parseMapTapScore(share('October 16', 700), on(2026, 10, 15)).date, '16/10/2026')
  assert.equal(parseMapTapScore(share('October 17', 700), on(2026, 10, 15)).date, '17/10/2025')
})

test('ignores markdown from WhatsApp and similar', () => {
  const parsed = parseMapTapScore('*www.maptap.gg October 15*\n_Final score:_ 912', on(2026, 10, 15))
  assert.equal(parsed.finalScore, '912')
})

test('accepts scores under 100 and abbreviated months', () => {
  const parsed = parseMapTapScore(share('Oct 5', 85), on(2026, 10, 15))
  assert.equal(parsed.date, '05/10/2026')
  assert.equal(parsed.finalScore, '85')
})

test('rejects text without a date or score, and impossible dates', () => {
  assert.equal(parseMapTapScore('Final score: 700', on(2026, 10, 15)), null)
  assert.equal(parseMapTapScore('www.maptap.gg October 15', on(2026, 10, 15)), null)
  assert.equal(parseMapTapScore(share('February 30', 700), on(2026, 10, 15)), null)
})
