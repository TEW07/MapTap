import { useState } from 'react'

// Simple SVG icons
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
)

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

const AlertIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
)

const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyxlBPpcnYN6LRsTSAvtOFFMTuasmNr2AtD4gjUdvnDUL7i3cTwNbFc1WVCErv11b9c/exec'

function App() {
  const [scoreText, setScoreText] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [parsedData, setParsedData] = useState(null)

  const parseMapTapScore = (text) => {
    console.log('=== MAPTAP DEBUG: Parsing score ===')
    console.log('Raw input:', text)

    const cleanText = text.replace(/[_*]/g, '').trim()
    console.log('Cleaned text:', cleanText)

    const dateMatch = cleanText.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/)
    const finalScoreMatch = cleanText.match(/Final score:\s*(\d{3,4})/i)

    console.log('Date match:', dateMatch)
    console.log('Score match:', finalScoreMatch)

    if (!dateMatch || !finalScoreMatch) {
      console.error('Parse failed - missing date or score match')
      return null
    }

    const month = dateMatch[1]
    const day = dateMatch[2]
    const finalScore = finalScoreMatch[1]

    const monthMap = {
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'May': '05', 'June': '06', 'July': '07', 'August': '08',
      'September': '09', 'October': '10', 'November': '11', 'December': '12'
    }

    const monthNum = monthMap[month] || month
    const parsedDate = `${day.padStart(2, '0')}/${monthNum}/2026`

    console.log('Parsed month:', month, '-> monthNum:', monthNum)
    console.log('Parsed day:', day)
    console.log('Final formatted date:', parsedDate)
    console.log('Final score:', finalScore)

    return {
      date: parsedDate,
      finalScore: finalScore,
      rawText: text
    }
  }

  const submitToGoogleSheets = async (playerName, data) => {
    const payload = {
      name: playerName,
      date: data.date,
      score: data.finalScore
    }

    // DEBUG: Log the exact payload being sent
    console.log('=== MAPTAP DEBUG: Submitting to Google Sheets ===')
    console.log('Endpoint:', SHEET_ENDPOINT)
    console.log('Payload:', JSON.stringify(payload, null, 2))

    try {
      const response = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      })

      // DEBUG: Log response details
      console.log('Response status:', response.status)
      console.log('Response ok:', response.ok)
      console.log('Response URL (after redirects):', response.url)

      const responseText = await response.text()
      console.log('Raw response text:', responseText)

      let result
      try {
        result = JSON.parse(responseText)
        console.log('Parsed response:', JSON.stringify(result, null, 2))
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError)
        throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`)
      }

      if (!result.success) {
        console.error('Server returned error:', result.error)
        throw new Error(result.error || 'Failed to submit score')
      }

      console.log('=== SUCCESS: Score submitted ===')
      console.log('Row:', result.row, 'Col:', result.col)
      return result

    } catch (fetchError) {
      console.error('=== FETCH ERROR ===')
      console.error('Error type:', fetchError.name)
      console.error('Error message:', fetchError.message)
      throw fetchError
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setStatus('error')
      setMessage('Please select your name')
      return
    }

    if (!scoreText.trim()) {
      setStatus('error')
      setMessage('Please paste your MapTap score')
      return
    }

    const parsed = parseMapTapScore(scoreText)

    if (!parsed) {
      setStatus('error')
      setMessage('Could not parse the MapTap format. Make sure you copied the entire message including the date and final score.')
      return
    }

    setParsedData(parsed)
    setStatus('loading')
    setMessage('Submitting your score...')

    try {
      await submitToGoogleSheets(name, parsed)
      setStatus('success')
      setMessage(`Score submitted successfully! ${parsed.finalScore} points on ${parsed.date}`)
      setScoreText('')
    } catch (error) {
      setStatus('error')
      setMessage(`Error: ${error.message}`)
    }
  }

  const names = ['Henry', 'Max', 'Nathan', 'Rob', 'Sean', 'Simon', 'Tom']

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎯 MapTap Score</h1>
          <p className="text-gray-600">Submit your daily score</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            >
              <option value="">Select your name...</option>
              {names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste Your MapTap Score
            </label>
            <textarea
              value={scoreText}
              onChange={(e) => setScoreText(e.target.value)}
              placeholder={`www.maptap.gg January 6\n99🔥 96🏅 98🔥 98🔥 5😭\nFinal score: 700`}
              rows="6"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-mono text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={status === 'loading'}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
          >
            {status === 'loading' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Submitting...
              </>
            ) : (
              <>
                <SendIcon />
                Submit Score
              </>
            )}
          </button>
        </div>

        {status === 'success' && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckIcon />
            <div>
              <p className="text-green-800 font-medium">Success!</p>
              <p className="text-green-700 text-sm">{message}</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertIcon />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm">{message}</p>
            </div>
          </div>
        )}

        {parsedData && status === 'success' && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-900 font-medium mb-2">Parsed Data:</p>
            <div className="text-sm text-blue-800 space-y-1">
              <p>Date: {parsedData.date}</p>
              <p>Final Score: {parsedData.finalScore}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
