# MapTap Apps Script

All the code that runs inside the MapTappers Google Sheet (Extensions → Apps Script,
project "MapTap Score Updater").

| File | What it does |
|---|---|
| `ScoreUpdater.js` | Web app the React form talks to: `doGet` lists players, `doPost` writes a score. |
| `Config.js` | Tab names, timezone, send times, sender names, text limits. |
| `Stats.js` | Weekly stats and the monthly leaderboard: points, averages, highs/lows, missed days, change on last week. |
| `Banter.js` | The insults. Edit freely. |
| `WeeklyEmail.js` | Builds the email (subject, HTML, plain text). |
| `Broadcast.js` | Contacts tab, Broadcast Log tab, tab locking, sending email and SMS (Twilio). |
| `Reminders.js` | Who gets tonight's reminder text, and the text itself. |
| `DailyReminder.js` | Reads the sheet, sends reminder texts, installs the 8pm trigger, Twilio credentials menu. |
| `WeeklySummary.js` | Reads the sheet, sends the weekly email, installs the Sunday trigger. |
| `Penalties.js` | Who gets the midnight penalty for a day. |
| `DailyPenalty.js` | Writes penalties, locks the finished day's row, installs the ~00:15 trigger. |

`Stats.js`, `Banter.js`, `WeeklyEmail.js`, `Reminders.js` and `Penalties.js` don't touch any Google services, so
they're tested under Node. `ScoreUpdater.js` and the reminder run are tested against a fake
sheet and a fake Twilio: `npm test`.

## Updating the form's web app (`ScoreUpdater.js`)

The form only sees changes to this file after a **redeploy**:

1. Open the sheet → **Extensions → Apps Script**, open the file with `doPost` in it
   (probably `Code.gs`), select all, and paste in `ScoreUpdater.js`. Save (Ctrl+S).
2. Pick **`checkScoreUpdater`** in the function dropdown → **Run**. It only reads the sheet.
   The log should list every player and show today's row.
3. **Deploy → Manage deployments** → select the existing deployment → **✏️ Edit** →
   **Version: New version** → **Deploy**.
   - Don't use **Deploy → New deployment**. That creates a new URL, and the form
     would keep calling the old one.
   - Leave *Execute as: Me* and *Who has access: Anyone* as they are.
4. Open the web app URL (ends `/exec`) in a browser. You should see
   `{"success":true,"players":[...]}`.

## Weekly summary setup (one-off, ~10 minutes)

1. Open the sheet → **Extensions → Apps Script**.
2. For each of `Config.js`, `Stats.js`, `Banter.js`, `WeeklyEmail.js`, `Broadcast.js`,
   `WeeklySummary.js`: click **+ → Script**, name it (e.g. `Config`), delete the
   placeholder and paste the file's contents. **Don't** add `ScoreUpdater.js` again: it's
   already there, and a second copy would break the form.
3. Save (Ctrl+S). Pick **`setupWeeklySummary`** in the function dropdown → **Run**.
   - Google asks for new permissions (send email, run on a schedule). You'll get a
     "Google hasn't verified this app" screen: **Advanced → Go to MapTap Score Updater**.
     It's your own script.
   - This creates a **Contacts** tab (everyone from Sheet1, Weekly Summary ticked), a
     **Broadcast Log** tab, and a trigger for Sundays at about 22:30 UK time.
4. On the Contacts tab, fill in **only your own email** for now.
5. Test it (all of these work on any day):
   - **`previewThisWeekSoFar`**: emails you this week up to today. This is roughly
     what Sunday's email will look like.
   - **`previewWeeklySummary`**: emails you the last full Monday–Sunday week.
   - **`sendWeeklySummary`**: the real send, which goes to everyone on Contacts with an
     email, so with only yours filled in it's just you. Don't run it once everyone's
     emails are in, or the group gets last week's summary.
   - **`testScheduledPreview`**: emails you the preview from a trigger in about 5
     minutes, which proves scheduling works. Afterwards, delete the leftover
     `previewWeeklySummary` trigger if it's still listed on the Triggers page.
6. Fill in everyone else's email.

These files don't need a redeploy. Triggers always run the latest saved code.

## Daily reminder texts setup

Texts anyone with **Daily Reminder** ticked who has no score in Sheet1 by about 20:00.

**Twilio (once):**
1. Sign up at twilio.com and **upgrade** the account (trial accounts can't send from a
   name like "MapTap"). The starting balance is the most you can ever lose.
2. **Billing → turn auto-recharge off.**
3. **Messaging → Settings → Geo permissions:** allow the United Kingdom only.
4. **Account → API keys & tokens → Create API key (Standard).** Note the key's SID (`SK…`)
   and secret (shown once), plus your Account SID (`AC…`) from the console home page.

**Google:**
1. Add `Reminders.js` and `DailyReminder.js` as new script files, and replace `Config.js`,
   `Banter.js` and `Broadcast.js` with the latest versions. Save.
2. Run **`setupDailyReminder`** and approve the new permission (connecting to an external
   service). This adds the **Paused Until** column to Contacts, makes Phone plain text,
   **locks Contacts and Broadcast Log** to you (others can still tick the opt-in
   boxes), and creates the 8pm trigger.
3. Reload the sheet → **MapTap → Set Twilio credentials…** → paste the three values.
4. On Contacts, type phone numbers as normal, e.g. `07700 900123`. Tick **Daily Reminder**
   for yourself only for now.
5. Run **`previewDailyReminders`**. It sends nothing, and the execution log shows who would be texted
   right now and the exact text.
6. Run **`sendTestText`**: it texts your own number (the Contacts row with your email).
7. When happy, tick Daily Reminder for everyone else.

**Limits** (in `Config.js`): one reminder per person per day, `MAX_TEXTS_PER_MONTH` (40,
about £1.65), `MAX_TEXTS_PER_RUN` (6), UK mobiles only, and each text kept to a single
plain SMS. If today has no row in Sheet1, nobody has played at all, or a limit is hit,
you get an email instead. `REMINDERS_ENABLED: false` switches texts off. Anyone who can
edit the sheet can also edit this script, so the Twilio balance (auto-recharge off) is
the real backstop.

**Pausing someone:** put a date in their **Paused Until** cell. No reminders up to and
including that day.

## Midnight penalty setup

At about 00:15, anyone with no score for the day before gets **-10** (`PENALTY_POINTS`)
in Sheet1, and that day's whole row is locked so only you can edit it. The form also
refuses submissions for a locked day. Players with a **Paused Until** date covering the
day are skipped. If the day has no row, or nobody played at all, you get an email and
nothing changes. Days before `PENALTIES_START` are never touched.

1. Replace `ScoreUpdater` (in `Code.gs`), `Config`, `Stats`, `WeeklyEmail`, `Banter` and
   `DailyReminder`, and add `Penalties` and `DailyPenalty` as new files. Save.
2. **Redeploy the web app** (see *Updating the form's web app* above), so the form knows
   about locked days.
3. Run **`setupDailyPenalty`**.
4. On each monthly leaderboard tab, wrap the daily points formula so a negative score
   counts as itself instead of being ranked (see below).

Points formula (first daily points cell, then fill across and down):

```
=LET(score, IFERROR(INDEX(Sheet1!$A:$Z, MATCH($AF2, Sheet1!$A:$A, 0), MATCH(AG$1, Sheet1!$1:$1, 0))),
  IF(AND(ISNUMBER(score), score < 0), score,
    XLOOKUP(AQ2, 'Scoring System'!$A$2:$A$9, 'Scoring System'!$B$2:$B$9, "-")))
```

**Testing:** fill a future date's row with fake scores, leaving one blank, then
**MapTap → Apply midnight penalty for a date…**. Afterwards use **MapTap → Unlock a
date's row…** and clear the row, or that day stays locked for real. `previewDailyPenalty`
(any evening) logs what tonight's run would do, without changing anything.
**MapTap → Test scheduled penalty for a date…** does the same from a timed trigger in
about 5 minutes, and **MapTap → Preview weekly email up to a date…** emails you the
week as it would look on that date, penalties included.

**Fixing a mistake:** as the owner you can still edit a locked row. Delete the -10 or
type the real score. To let the form accept a late score, unlock the row first.

## Day-to-day

- **Did it send?** Check the **Broadcast Log** tab (SENT / SKIPPED / FAILED). Apps
  Script's **Executions** page (left sidebar) has full logs, and Google emails you if a
  run fails.
- **Someone wants out?** Untick their Weekly Summary or Daily Reminder box.
- **Texts:** every text is a SENT row in the Broadcast Log (number masked). Twilio's
  console (Monitor → Logs → Messaging) shows delivery and the price of each.
- **New player?** Add their column to Sheet1 and a row to Contacts. Nothing else needed.
  New Contacts rows sit inside the locked area, so add them yourself, and add tick boxes
  in their two opt-in cells (Insert → Checkbox).
- **Change the time?** Edit `WEEKLY_SUMMARY_DAY` / `_HOUR` / `_MINUTE` in `Config.js`,
  save, and run `setupWeeklySummary` again. It replaces the old trigger rather than
  adding a second one. The Triggers page only shows the hour (e.g. "10pm to 11pm").
  Google sends within about 15 minutes of the set time.

## How the numbers work

- Weeks run Monday–Sunday. Sunday's run reports on the week ending that day. Any other
  day, `sendWeeklySummary`/`previewWeeklySummary` report the last full week.
- Points: each day's scores are ranked and looked up in the **Scoring System** tab, the
  same as the leaderboard tabs. Ties share the higher rank.
- **Missed days** score the penalty from `PENALTIES_START` (-10, shown in Sheet1), or
  0 points before that or while paused. A penalty isn't a score: it's left out of
  averages and highest/lowest. Each forgotten day puts a 🤡
  next to the player's name in both tables, all month, plus a Hall of shame line.
- The **monthly leaderboard** is worked out from Sheet1 with the same scoring as the
  leaderboard tabs, so it doesn't depend on tab names. *Move* is the change in position
  since last Sunday. A week that crosses into a new month also shows the old month's
  final table.
- **Averages only count days played**, so a missed day isn't punished twice.
- Anyone without a Sunday score at send time gets ⏰ rather than a clown (they may still
  play), plus a "No score yet" line. Scores added later still count on the leaderboard but
  won't be in that week's email.

## Sending from a separate account

Emails come from whoever ran `setupWeeklySummary`, shown as "MapTap Bot"
(`SENDER_NAME` in `Config.js`). To send from a dedicated Gmail instead:

1. Create the account and share the sheet with it as an **Editor**.
2. Signed in as that account, open Extensions → Apps Script and run `setupWeeklySummary`.
3. Signed in as yourself, open **Triggers** (clock icon) and delete your own
   `sendWeeklySummary` trigger so the email doesn't go out twice.
