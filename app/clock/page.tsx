// app/clock/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ClockPageContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [step,       setStep]       = useState<'validate'|'pin'|'confirm'|'done'|'error'>('validate')
  const [pin,        setPin]        = useState('')
  const [mode,       setMode]       = useState<'in'|'out'>('in')
  const [location,   setLocation]   = useState<any>(null)
  const [gpsCoords,  setGpsCoords]  = useState<{lat:number;lng:number}|null>(null)
  const [gpsError,   setGpsError]   = useState<string|null>(null)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<any>(null)
  const [errorMsg,   setErrorMsg]   = useState('')
  const pinRef = useRef<HTMLInputElement>(null)

  // ── Validate QR token on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid QR code — please scan again.'); return }

    fetch(`/api/clock/qr?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setLocation(data.location)
          setStep('pin')
          // Request GPS
          navigator.geolocation?.getCurrentPosition(
            pos => setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            ()  => setGpsError('GPS unavailable — clock-in will be flagged'),
            { timeout: 8000, enableHighAccuracy: true }
          )
        } else {
          setStep('error')
          setErrorMsg(data.error ?? 'Invalid QR code')
        }
      })
      .catch(() => { setStep('error'); setErrorMsg('Network error — please try again') })
  }, [token])

  useEffect(() => {
    if (step === 'pin') setTimeout(() => pinRef.current?.focus(), 100)
  }, [step])

  // ── Submit clock in/out ───────────────────────────────────────────────────
  async function handleSubmit() {
    if (pin.length !== 4) return
    setLoading(true)
    setErrorMsg('')

    try {
      const endpoint = mode === 'in' ? '/api/clock/in' : '/api/clock/out'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pin,
          token,
          lat: gpsCoords?.lat ?? null,
          lng: gpsCoords?.lng ?? null,
        }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setResult(data)
        setStep('done')
        // Auto-reset after 8 seconds for next person
        setTimeout(() => {
          setStep('pin')
          setPin('')
          setResult(null)
          setMode('in')
        }, 8000)
      } else {
        setErrorMsg(data.error ?? 'Something went wrong')
        setPin('')
        if (res.status === 409 && data.already_in) setMode('out')
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }

  function handlePinKey(digit: string) {
    if (pin.length < 4) {
      const newPin = pin + digit
      setPin(newPin)
      if (newPin.length === 4) setTimeout(handleSubmit, 100)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const primary = '#3E1F00'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: '#fdf6f0' }}>

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-2">🍞</div>
        <h1 className="text-2xl font-bold" style={{ color: primary }}>
          Norbake Bakery
        </h1>
        {location && (
          <p className="text-gray-500 text-sm mt-1">{location.name}</p>
        )}
      </div>

      {/* ── Step: Validate ── */}
      {step === 'validate' && (
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: primary, borderTopColor: 'transparent' }} />
          <p className="text-gray-600">Validating QR code...</p>
        </div>
      )}

      {/* ── Step: Error ── */}
      {step === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-sm">
          <p className="text-4xl mb-3">❌</p>
          <p className="font-semibold text-red-800">{errorMsg}</p>
          <p className="text-red-600 text-sm mt-2">Ask your manager to regenerate the QR code.</p>
        </div>
      )}

      {/* ── Step: PIN Entry ── */}
      {step === 'pin' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-xs">

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border mb-5">
            <button
              onClick={() => setMode('in')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                mode === 'in' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={mode === 'in' ? { backgroundColor: primary } : {}}>
              Clock IN
            </button>
            <button
              onClick={() => setMode('out')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                mode === 'out' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={mode === 'out' ? { backgroundColor: '#dc2626' } : {}}>
              Clock OUT
            </button>
          </div>

          <p className="text-center text-gray-600 text-sm mb-4 font-medium">
            Enter your 4-digit PIN
          </p>

          {/* PIN dots display */}
          <div className="flex justify-center gap-4 mb-5">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all ${
                pin.length > i
                  ? 'scale-110'
                  : 'bg-transparent'
              }`}
              style={{
                backgroundColor: pin.length > i ? primary : undefined,
                borderColor: primary,
              }} />
            ))}
          </div>

          {/* Hidden input for mobile keyboard */}
          <input
            ref={pinRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPin(v)
              if (v.length === 4) setTimeout(handleSubmit, 100)
            }}
            className="opacity-0 absolute"
          />

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  if (d === '⌫') setPin(p => p.slice(0,-1))
                  else if (d !== '') handlePinKey(String(d))
                }}
                disabled={loading || d === ''}
                className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                  d === '' ? 'invisible' :
                  d === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' :
                  'bg-gray-50 text-gray-800 hover:bg-gray-100 border border-gray-200'
                } disabled:opacity-50`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
              {errorMsg}
            </div>
          )}

          {/* GPS status */}
          {gpsError && (
            <p className="text-xs text-amber-600 text-center mt-3">⚠️ {gpsError}</p>
          )}
          {gpsCoords && (
            <p className="text-xs text-green-600 text-center mt-3">📍 GPS active</p>
          )}

          {/* Loading */}
          {loading && (
            <div className="mt-4 flex justify-center">
              <div className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: primary, borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === 'done' && result && (
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="text-6xl mb-4">
            {mode === 'in' ? '✅' : '👋'}
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: primary }}>
            {result.staff_name}
          </h2>
          <p className="text-lg font-semibold text-gray-700">
            {mode === 'in' ? 'Clocked In' : 'Clocked Out'}
          </p>
          <p className="text-3xl font-bold mt-2" style={{ color: primary }}>
            {mode === 'in' ? result.clocked_in : result.clocked_out}
          </p>
          {mode === 'out' && result.paid_hours > 0 && (
            <p className="text-gray-500 mt-2 text-sm">
              {result.paid_hours.toFixed(2)} hrs paid
              {result.gross_pay !== null && ` • $${Number(result.gross_pay).toFixed(2)}`}
            </p>
          )}

          {result.flags?.length > 0 && (
            <div className="mt-4 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              ⚠️ {result.flags.join(', ')}
            </div>
          )}

          <p className="text-gray-400 text-xs mt-6">
            Resetting in a few seconds...
          </p>
        </div>
      )}

      {/* Current time */}
      <div className="mt-8 text-gray-400 text-sm">
        {new Date().toLocaleTimeString('en-AU', {
          timeZone: 'Australia/Brisbane',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
}

export default function ClockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <ClockPageContent />
    </Suspense>
  )
}