// Web app that receives scores from the React form (src/App.jsx) and writes
// them into Sheet1. This is a copy of what's already deployed as
// "MapTap Score Updater" - kept here for version control.

function doGet(e) {
  return ContentService
    .createTextOutput('Script is accessible! Deployment is working correctly.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  // Create a log array to track what happens
  const debugLog = [];

  try {
    debugLog.push('=== doPost called ===');
    debugLog.push('postData exists: ' + (e.postData ? 'yes' : 'no'));
    debugLog.push('postData.contents: ' + (e.postData ? e.postData.contents : 'N/A'));

    const data = JSON.parse(e.postData.contents);
    debugLog.push('Parsed data: ' + JSON.stringify(data));

    const playerName = data.name;
    const dateStr = data.date;
    const score = data.score;

    debugLog.push('Player: ' + playerName);
    debugLog.push('Date string: ' + dateStr);
    debugLog.push('Score: ' + score);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    debugLog.push('Spreadsheet name: ' + ss.getName());

    const sheet = ss.getSheetByName('Sheet1');
    if (!sheet) {
      debugLog.push('ERROR: Sheet1 not found!');
      return buildResponse({
        success: false,
        error: 'Sheet1 not found',
        debug: debugLog
      });
    }
    debugLog.push('Sheet found: Sheet1');

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    debugLog.push('Data range rows: ' + values.length);
    debugLog.push('Data range cols: ' + (values[0] ? values[0].length : 0));

    // Log first few rows of column A for debugging
    debugLog.push('--- Column A values (first 10 rows) ---');
    for (let i = 0; i < Math.min(10, values.length); i++) {
      const cellVal = values[i][0];
      const cellType = typeof cellVal;
      const cellStr = cellVal instanceof Date ? cellVal.toISOString() : String(cellVal);
      debugLog.push('Row ' + (i+1) + ': [' + cellType + '] ' + cellStr);
    }

    let targetRow = -1;
    const dayPart = dateStr.split('/')[0];
    const monthPart = dateStr.split('/')[1];
    debugLog.push('Looking for day: ' + dayPart + ', month: ' + monthPart);

    for (let i = 0; i < values.length; i++) {
      const cellDate = values[i][0];

      if (cellDate) {
        let cellDateStr;

        // Handle Date objects vs strings
        if (cellDate instanceof Date) {
          const cellDay = cellDate.getDate().toString().padStart(2, '0');
          const cellMonth = (cellDate.getMonth() + 1).toString().padStart(2, '0');
          cellDateStr = cellDay + '/' + cellMonth;
          debugLog.push('Row ' + (i+1) + ' Date object: day=' + cellDay + ' month=' + cellMonth);
        } else {
          cellDateStr = cellDate.toString();
        }

        // Check if this row matches the day
        if (cellDateStr.includes(dayPart + '/' + monthPart) ||
            (cellDate instanceof Date &&
             cellDate.getDate() === parseInt(dayPart) &&
             (cellDate.getMonth() + 1) === parseInt(monthPart))) {
          targetRow = i + 1;
          debugLog.push('MATCH FOUND at row ' + targetRow);
          break;
        }
      }
    }

    if (targetRow === -1) {
      debugLog.push('ERROR: Date not found in sheet');
      return buildResponse({
        success: false,
        error: 'Date not found in sheet. Looking for day: ' + dayPart + ', month: ' + monthPart,
        debug: debugLog
      });
    }

    const headers = values[0];
    let targetCol = -1;

    debugLog.push('--- Headers ---');
    debugLog.push(JSON.stringify(headers));

    for (let j = 0; j < headers.length; j++) {
      const headerVal = String(headers[j]).trim();
      debugLog.push('Header ' + j + ': "' + headerVal + '" vs "' + playerName + '" = ' + (headerVal === playerName));
      if (headerVal === playerName) {
        targetCol = j + 1;
        debugLog.push('COLUMN MATCH at col ' + targetCol);
        break;
      }
    }

    if (targetCol === -1) {
      debugLog.push('ERROR: Player not found in headers');
      return buildResponse({
        success: false,
        error: 'Player "' + playerName + '" not found in header row.',
        debug: debugLog
      });
    }

    debugLog.push('Setting value at row=' + targetRow + ' col=' + targetCol + ' value=' + score);
    sheet.getRange(targetRow, targetCol).setValue(score);
    debugLog.push('setValue completed');

    // Verify the write
    const verifyValue = sheet.getRange(targetRow, targetCol).getValue();
    debugLog.push('Verification read: ' + verifyValue);

    return buildResponse({
      success: true,
      message: 'Score recorded successfully',
      row: targetRow,
      col: targetCol,
      debug: debugLog
    });

  } catch (error) {
    debugLog.push('EXCEPTION: ' + error.toString());
    debugLog.push('Stack: ' + error.stack);
    return buildResponse({
      success: false,
      error: error.toString(),
      debug: debugLog
    });
  }
}

function buildResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
