// Weekly stats logic. No SpreadsheetApp or MailApp in here, so the same code
// runs under Node for testing (see test/weekly-summary.test.js).
// Dates are 'yyyy-MM-dd' strings throughout to avoid timezone surprises.

const DAY_NAMES_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES_ = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function keyToDate_(key) {
  const parts = key.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addDays_(key, days) {
  const date = keyToDate_(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDay_(key) {
  const date = keyToDate_(key);
  return DAY_NAMES_[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + MONTH_NAMES_[date.getUTCMonth()];
}

function formatMonth_(key) {
  return FULL_MONTH_NAMES_[keyToDate_(key).getUTCMonth()];
}

// Weeks run Monday to Sunday. Returns the Sunday on or before the given day.
function weekEndingOnOrBefore_(key) {
  return addDays_(key, -keyToDate_(key).getUTCDay());
}

// Sheet1 dates are normally real date cells, but accept 'dd/mm/yyyy' text too.
function parseDateText_(value) {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
}

function toScore_(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(value);
  return isFinite(score) ? score : null;
}

function average_(numbers) {
  return numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
}

// Same rules as the leaderboard tabs: rank the day's scores and look each rank
// up in the Scoring System table. A blank score gets nothing. Ties share the
// higher rank (two people on 950 both come 1st and the next person is 3rd).
// A negative score is a midnight penalty (DailyPenalty.js): it's worth exactly
// that many points and isn't ranked.
function pointsForDay_(scores, pointsByRank) {
  const names = Object.keys(scores).filter(name => scores[name] !== null && scores[name] >= 0);
  const points = {};
  names.forEach(name => {
    const rank = 1 + names.filter(other => scores[other] > scores[name]).length;
    points[name] = pointsByRank[rank - 1] || 0;
  });
  Object.keys(scores).forEach(name => {
    if (scores[name] !== null && scores[name] < 0) points[name] = scores[name];
  });
  return points;
}

function dayRange_(startKey, endKey) {
  const keys = [];
  for (let key = startKey; key <= endKey; key = addDays_(key, 1)) keys.push(key);
  return keys;
}

function monthStart_(key) {
  return key.slice(0, 8) + '01';
}

function monthEnd_(key) {
  const date = keyToDate_(monthStart_(key));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return addDays_(date.toISOString().slice(0, 10), -1);
}

// data is { players: ['Henry', ...], days: { '2026-10-05': { Henry: 907, Max: null, ... } } }
// Dates with no row in Sheet1 are skipped rather than counted as missed.
function summariseDays_(data, dayKeys, pointsByRank) {
  const players = data.players.map(name => ({
    name: name, points: 0, total: 0, played: 0, missedDays: [], penalties: {}, average: null,
  }));
  const entries = []; // every score posted: { name, day, score }

  dayKeys.forEach(day => {
    const scores = data.days[day];
    if (!scores) return;
    const points = pointsForDay_(scores, pointsByRank);
    players.forEach(player => {
      const score = scores[player.name];
      // Blank, or a penalty: a forgotten day either way, and never a "score"
      // for averages or highest/lowest.
      if (score === null || score === undefined || score < 0) {
        player.missedDays.push(day);
        if (score < 0) {
          player.penalties[day] = score;
          player.points += score;
        }
        return;
      }
      player.played++;
      player.total += score;
      player.points += points[player.name];
      entries.push({ name: player.name, day: day, score: score });
    });
  });

  players.forEach(player => {
    if (player.played) player.average = player.total / player.played;
  });
  return { dayKeys: dayKeys, players: players, entries: entries };
}

// Most points first (average breaks ties for ordering only). Equal points
// share a position.
function rankByPoints_(players) {
  const standings = players.slice().sort((a, b) =>
    b.points - a.points || (b.average || 0) - (a.average || 0));
  standings.forEach(player => {
    player.position = 1 + standings.filter(other => other.points > player.points).length;
  });
  return standings;
}

// A missed day earns a clown. A blank final day doesn't count yet: anyone
// without a score at send time may still play. A penalty means it's over.
function forgottenDays_(player, lastDayKey) {
  return player.missedDays.filter(day => day !== lastDayKey || day in player.penalties);
}

// One month's leaderboard up to lastDayKey, plus how far each player moved
// since the end of last week (when last week was in the same month).
function monthStandings_(data, monthKey, lastDayKey, weekStartKey, pointsByRank) {
  const endKey = monthEnd_(monthKey) < lastDayKey ? monthEnd_(monthKey) : lastDayKey;
  const standings = rankByPoints_(summariseDays_(data, dayRange_(monthKey, endKey), pointsByRank).players);
  const before = weekStartKey > monthKey
    ? summariseDays_(data, dayRange_(monthKey, addDays_(weekStartKey, -1)), pointsByRank).players
    : null;
  if (before) rankByPoints_(before);

  standings.forEach(player => {
    const previous = before && before.find(p => p.name === player.name);
    player.movement = previous ? previous.position - player.position : null;
    player.forgotten = forgottenDays_(player, lastDayKey);
  });
  return {
    monthKey: monthKey,
    endKey: endKey,
    isFinal: endKey === monthEnd_(monthKey),
    standings: standings,
  };
}

// asOfKey is optional: pass today to preview a week that's still going.
// Days after it haven't happened yet, so they're left out.
function computeWeeklyStats_(data, weekEndKey, pointsByRank, asOfKey) {
  const weekStartKey = addDays_(weekEndKey, -6);
  const lastDayKey = asOfKey && asOfKey < weekEndKey ? asOfKey : weekEndKey;
  const week = summariseDays_(data, dayRange_(weekStartKey, lastDayKey), pointsByRank);
  if (!week.entries.length) {
    return { weekStartKey: weekStartKey, weekEndKey: weekEndKey, hasScores: false };
  }

  const lastWeek = summariseDays_(data,
    dayRange_(addDays_(weekStartKey, -7), addDays_(weekStartKey, -1)), pointsByRank);
  const hasLastWeek = lastWeek.entries.length > 0;
  const lastDay = data.days[lastDayKey];
  week.players.forEach((player, i) => {
    const previous = lastWeek.players[i];
    player.pointsChange = hasLastWeek ? player.points - previous.points : null;
    player.averageChange = player.average !== null && previous.average !== null
      ? player.average - previous.average
      : null;
    player.forgotten = forgottenDays_(player, lastDayKey);
    player.stillToPlay = Boolean(lastDay) && lastDay[player.name] === null;
  });

  const standings = rankByPoints_(week.players);
  const topPoints = standings[0].points;
  const bottomPoints = standings[standings.length - 1].points;

  const scores = week.entries.map(entry => entry.score);
  const highest = Math.max.apply(null, scores);
  const lowest = Math.min.apply(null, scores);
  const groupAverage = average_(scores);

  const byChange = week.players
    .filter(player => player.averageChange !== null)
    .sort((a, b) => b.averageChange - a.averageChange);
  const mostImproved = byChange[0];
  const biggestDrop = byChange[byChange.length - 1];

  // Usually just this month. A week that crosses into a new month also shows
  // the old month's final table.
  const months = [];
  week.dayKeys.forEach(day => {
    if (months.indexOf(monthStart_(day)) === -1) months.push(monthStart_(day));
  });

  return {
    weekStartKey: weekStartKey,
    weekEndKey: weekEndKey,
    lastDayKey: lastDayKey,
    hasScores: true,
    standings: standings,
    months: months.map(month => monthStandings_(data, month, lastDayKey, weekStartKey, pointsByRank)),
    winners: standings.filter(player => player.points === topPoints),
    woodenSpoons: bottomPoints < topPoints
      ? standings.filter(player => player.points === bottomPoints)
      : [],
    highest: week.entries.filter(entry => entry.score === highest),
    lowest: week.entries.filter(entry => entry.score === lowest),
    groupAverage: groupAverage,
    groupAverageChange: hasLastWeek
      ? groupAverage - average_(lastWeek.entries.map(entry => entry.score))
      : null,
    mostImproved: mostImproved && mostImproved.averageChange > 0 ? mostImproved : null,
    biggestDrop: biggestDrop && biggestDrop.averageChange < 0 ? biggestDrop : null,
    noShows: week.players
      .filter(player => player.forgotten.length)
      .sort((a, b) => b.forgotten.length - a.forgotten.length),
    stillToPlay: week.players.filter(player => player.stillToPlay),
  };
}
