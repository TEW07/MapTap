const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DATE_PATTERN = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i
const SCORE_PATTERN = /Final score:\s*(\d{1,4})\b/i

const pad = (n) => String(n).padStart(2, '0')

// Pulls the date and final score out of MapTap's share text, e.g.
//   www.maptap.gg January 6
//   99🔥 96🏅 98🔥 98🔥 5😭
//   Final score: 700
// The share text has no year, so assume the most recent such date: pasting
// "December 31" on 1 January means last year. One day of slack covers anyone
// playing in a timezone ahead of ours.
export function parseMapTapScore(text, today = new Date()) {
  const cleanText = text.replace(/[_*]/g, '')
  const dateMatch = cleanText.match(DATE_PATTERN)
  const scoreMatch = cleanText.match(SCORE_PATTERN)
  if (!dateMatch || !scoreMatch) return null

  const month = MONTHS.indexOf(dateMatch[1].slice(0, 3).toLowerCase())
  const day = Number(dateMatch[2])
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  let year = today.getFullYear()
  if (new Date(year, month, day) > tomorrow) year--

  const date = new Date(year, month, day)
  if (date.getMonth() !== month || date.getDate() !== day) return null // e.g. "February 30"

  return {
    date: `${pad(day)}/${pad(month + 1)}/${year}`,
    finalScore: scoreMatch[1],
    rawText: text,
  }
}
