// Weekly stats logic. No SpreadsheetApp or MailApp in here, so the same code
// runs under Node for testing (see test/weekly-summary.test.js).
// Dates are 'yyyy-MM-dd' strings throughout to avoid timezone surprises.

const DAY_NAMES_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
function pointsForDay_(scores, pointsByRank) {
  const names = Object.keys(scores).filter(name => scores[name] !== null);
  const points = {};
  names.forEach(name => {
    const rank = 1 + names.filter(other => scores[other] > scores[name]).length;
    points[name] = pointsByRank[rank - 1] || 0;
  });
  return points;
}

// data is { players: ['Henry', ...], days: { '2026-10-05': { Henry: 907, Max: null, ... } } }
function summariseWeek_(data, weekEndKey, pointsByRank) {
  const dayKeys = [];
  for (let offset = 6; offset >= 0; offset--) dayKeys.push(addDays_(weekEndKey, -offset));

  const players = data.players.map(name => ({
    name: name, points: 0, total: 0, played: 0, missed: 0, average: null,
  }));
  const entries = []; // every score posted this week: { name, day, score }

  dayKeys.forEach(day => {
    const scores = data.days[day];
    if (!scores) return; // no row for this date in Sheet1
    const points = pointsForDay_(scores, pointsByRank);
    players.forEach(player => {
      const score = scores[player.name];
      if (score === null || score === undefined) {
        player.missed++;
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

function computeWeeklyStats_(data, weekEndKey, pointsByRank) {
  const week = summariseWeek_(data, weekEndKey, pointsByRank);
  const weekStartKey = week.dayKeys[0];
  if (!week.entries.length) {
    return { weekStartKey: weekStartKey, weekEndKey: weekEndKey, hasScores: false };
  }

  const lastWeek = summariseWeek_(data, addDays_(weekEndKey, -7), pointsByRank);
  const hasLastWeek = lastWeek.entries.length > 0;
  week.players.forEach((player, i) => {
    const previous = lastWeek.players[i];
    player.pointsChange = hasLastWeek ? player.points - previous.points : null;
    player.averageChange = player.average !== null && previous.average !== null
      ? player.average - previous.average
      : null;
  });

  const standings = week.players.slice().sort((a, b) =>
    b.points - a.points || (b.average || 0) - (a.average || 0));
  standings.forEach(player => {
    player.position = 1 + standings.filter(other => other.points > player.points).length;
  });
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

  // Scores still missing on the final day. At 22:30 on Sunday some people
  // may not have played yet.
  const lastDay = data.days[weekEndKey];

  return {
    weekStartKey: weekStartKey,
    weekEndKey: weekEndKey,
    hasScores: true,
    standings: standings,
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
    noShows: week.players.filter(player => player.missed > 0).sort((a, b) => b.missed - a.missed),
    stillToPlay: lastDay ? week.players.filter(player => lastDay[player.name] === null) : [],
  };
}
