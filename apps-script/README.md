# MapTap Apps Script

All the code that runs inside the MapTappers Google Sheet (Extensions → Apps Script,
project "MapTap Score Updater").

| File | What it does |
|---|---|
| `ScoreUpdater.js` | Web app the React form talks to: `doGet` lists players, `doPost` writes a score. |
| `Config.js` | Tab names, timezone, sender name. |
| `Stats.js` | Weekly stats: points, averages, highs/lows, missed days, change on last week. |
| `Banter.js` | The insults. Edit freely. |
| `WeeklyEmail.js` | Builds the email (subject, HTML, plain text). |
| `Broadcast.js` | Contacts tab, Broadcast Log tab, sending email. Reused by future broadcasts. |
| `WeeklySummary.js` | Reads the sheet, sends the weekly email, installs the Sunday trigger. |

`Stats.js`, `Banter.js` and `WeeklyEmail.js` don't touch any Google services, so they're
tested under Node, as is `ScoreUpdater.js` against a fake sheet: `npm test`.

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
4. Fill in everyone's **Email** on the Contacts tab.
5. Run **`previewWeeklySummary`**: it emails last week's summary to you only.

These files don't need a redeploy. Triggers always run the latest saved code.

## Day-to-day

- **Did it send?** Check the **Broadcast Log** tab (SENT / SKIPPED / FAILED). Apps
  Script's **Executions** page (left sidebar) has full logs, and Google emails you if a
  run fails.
- **Someone wants out?** Untick their Weekly Summary box.
- **New player?** Add their column to Sheet1 and a row to Contacts. Nothing else needed.
- **Change the time?** Edit `setupWeeklySummary` and run it again. It replaces the old
  trigger rather than adding a second one.

## How the numbers work

- Weeks run Monday–Sunday. Sunday's run reports on the week ending that day. A preview
  on any other day reports on the last full week.
- Points: each day's scores are ranked and looked up in the **Scoring System** tab, the
  same as the leaderboard tabs. Ties share the higher rank.
- **Missed days score 0 points** (same as the leaderboard), and are called out by name.
- **Averages only count days played**, so a missed day isn't punished twice.
- Anyone without a Sunday score at 22:30 gets a "no score yet today" line. Scores added
  later still count on the leaderboard but won't be in that week's email.

## Sending from a separate account

Emails come from whoever ran `setupWeeklySummary`, shown as "MapTap Bot"
(`SENDER_NAME` in `Config.js`). To send from a dedicated Gmail instead:

1. Create the account and share the sheet with it as an **Editor**.
2. Signed in as that account, open Extensions → Apps Script and run `setupWeeklySummary`.
3. Signed in as yourself, open **Triggers** (clock icon) and delete your own
   `sendWeeklySummary` trigger so the email doesn't go out twice.
