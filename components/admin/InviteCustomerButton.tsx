'use client'

import { useState } from 'react'

interface Props {
  customerId: string
  customerEmail: string | null
  portalAccess: boolean
  confirmed?: boolean  // true = has logged in before, show resend
}

export default function InviteCustomerButton({
  customerId,
  customerEmail,
  portalAccess,
  confirmed = false,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error' | 'resent'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleInvite = async () => {
    if (!customerEmail) {
      setErrorMsg('No email address on file')
      setStatus('error')
      return
    }

    setStatus('loading')

    const res = await fetch('/api/admin/invite-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    })

    const data = await res.json()

    if (!res.ok) {
      setErrorMsg(data.error ?? 'Something went wrong')
      setStatus('error')
      return
    }

    // If they were already confirmed, show "resent" — otherwise "sent"
    setStatus(confirmed ? 'resent' : 'sent')
  }

  // ── Already confirmed + no action yet — show resend button ──────
  if (confirmed && status === 'idle') {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={handleInvite}
          disabled={!customerEmail}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
            border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Resend Invite
        </button>
        {!customerEmail && (
          <p className="text-xs text-amber-600">No email on file</p>
        )}
      </div>
    )
  }

  // ── Loading state ───────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
          bg-blue-600 text-white opacity-50 cursor-not-allowed"
      >
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Sending...
      </button>
    )
  }

  // ── Successfully sent (new invite) ──────────────────────────────
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 11.586l6.293-6.293a1 1 0 011.414 0z"
            clipRule="evenodd" />
        </svg>
        Invite Sent!
      </span>
    )
  }

  // ── Successfully resent ─────────────────────────────────────────
  if (status === 'resent') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 11.586l6.293-6.293a1 1 0 011.414 0z"
            clipRule="evenodd" />
        </svg>
        Invite Resent!
      </span>
    )
  }

  // ── Error state ─────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={handleInvite}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 transition-colors"
        >
          Retry
        </button>
        <p className="text-xs text-red-600">{errorMsg}</p>
      </div>
    )
  }

  // ── Default — not yet invited ───────────────────────────────────
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleInvite}
        disabled={!customerEmail}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
          bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Grant Portal Access
      </button>
      {!customerEmail && (
        <p className="text-xs text-amber-600">No email on file — add one first</p>
      )}
    </div>
  )
}