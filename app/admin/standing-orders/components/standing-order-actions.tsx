'use client'

import { useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'

export default function StandingOrderActions() {
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleManualGeneration() {
    if (!confirm('Generate orders for all active standing orders today?')) return

    setGenerating(true)
    setMessage(null)

    try {
      const response = await fetch('/api/standing-orders/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `✅ Successfully generated ${data.generated || 0} orders`,
        })
      } else {
        setMessage({
          type: 'error',
          text: `❌ Failed: ${data.error || 'Unknown error'}`,
        })
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Error: ${error.message}`,
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleManualGeneration}
        disabled={generating}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <PlayCircle className="h-5 w-5" />
            Generate Orders Now
          </>
        )}
      </button>

      {message && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
