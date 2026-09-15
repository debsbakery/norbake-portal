'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'

interface Item {
  id: string
  is_weekly: boolean
  customer_id: string
  customer_name: string
  customer_email: string
  invoice_number: number | null
  doc_date: string
  due_date: string
  days_overdue: number
  total_amount: number
  balance: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

export default function OverdueResendPage() {
  const router = useRouter()
  const [items, setItems]     = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [picked, setPicked]   = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Record<string, 'sent' | 'error' | 'sending'>>({})
  const [done, setDone]       = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/ar/overdue-list')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setItems(data.items ?? [])
      setPicked(new Set((data.items ?? []).map((i: Item) => i.id)))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const selected = useMemo(() => items.filter(i => picked.has(i.id)), [items, picked])

  const stats = useMemo(() => ({
    emails:    selected.length,
    customers: new Set(selected.map(i => i.customer_id)).size,
    balance:   Math.round(selected.reduce((s, i) => s + i.balance, 0) * 100) / 100,
  }), [selected])

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setPicked(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)))
  }

  async function sendSelected() {
    if (selected.length === 0) return
    const msg =
      `Send ${stats.emails} invoice email${stats.emails === 1 ? '' : 's'} to ` +
      `${stats.customers} customer${stats.customers === 1 ? '' : 's'}?\n\n` +
      `Total outstanding: ${fmt(stats.balance)}\n\n` +
      `Each email includes the invoice PDF. This cannot be undone.`
    if (!confirm(msg)) return

    setSending(true)
    setDone(false)
    setResults(Object.fromEntries(selected.map(i => [i.id, 'sending' as const])))

    for (const item of selected) {
      try {
        let ok = false
        if (item.is_weekly) {
          const res  = await fetch(`/api/admin/weekly-invoices/${item.id}/send`, { method: 'POST' })
          const data = await res.json()
          ok = res.ok && data.success
        } else {
          const res = await fetch('/api/admin/batch-invoice', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              delivery_date: item.doc_date,
              sendEmails:    true,
              emailOnly:     true,
              customer_id:   item.customer_id,
            }),
          })
          const data = await res.json()
          ok = res.ok && data.success
        }
        setResults(prev => ({ ...prev, [item.id]: ok ? 'sent' : 'error' }))
      } catch {
        setResults(prev => ({ ...prev, [item.id]: 'error' }))
      }
      await new Promise(r => setTimeout(r, 700))
    }

    setSending(false)
    setDone(true)
  }

  const sentCount  = Object.values(results).filter(r => r === 'sent').length
  const errorCount = Object.values(results).filter(r => r === 'error').length

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/resend-invoices')}
          className="p-2 hover:bg-gray-200 rounded-lg" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold">Resend Overdue Invoices</h1>
      </div>

      <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Sends one email per invoice with the PDF attached, to the customer's registered
          address. Review the list before sending. Customers without an email address are
          not listed.
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading overdue invoices...</div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nothing overdue.</div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap items-center gap-4">
            <button onClick={toggleAll} disabled={sending}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50">
              {picked.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-sm text-gray-600">
              <strong>{stats.emails}</strong> email{stats.emails === 1 ? '' : 's'} to{' '}
              <strong>{stats.customers}</strong> customer{stats.customers === 1 ? '' : 's'}
              {' \u2014 '}<strong>{fmt(stats.balance)}</strong> outstanding
            </span>
            <button onClick={sendSelected} disabled={sending || selected.length === 0}
              className="ml-auto flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg
                         font-medium hover:bg-red-700 disabled:bg-gray-300 text-sm">
              {sending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                : <><Send className="w-4 h-4" /> Send selected</>}
            </button>
          </div>

          {done && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              Finished: {sentCount} sent{errorCount > 0 ? `, ${errorCount} failed` : ''}.
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Invoice</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Due</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Days</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Balance</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map(i => (
                    <tr key={i.id} className={picked.has(i.id) ? '' : 'opacity-40'}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={picked.has(i.id)}
                          onChange={() => toggle(i.id)} disabled={sending}
                          aria-label={`Select invoice for ${i.customer_name}`}
                          className="w-4 h-4" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{i.customer_name}</div>
                        <div className="text-xs text-gray-500">{i.customer_email}</div>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-600">
                        {i.invoice_number ? `#${String(i.invoice_number).padStart(6, '0')}` : i.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{i.is_weekly ? 'Weekly' : 'Daily'}</td>
                      <td className="px-4 py-2 text-gray-600">{fmtDate(i.due_date)}</td>
                      <td className="px-4 py-2 text-right font-mono text-red-600">{i.days_overdue}</td>
                      <td className="px-4 py-2 text-right font-mono font-medium">{fmt(i.balance)}</td>
                      <td className="px-4 py-2 text-center">
                        {results[i.id] === 'sending' && <Loader2 className="w-4 h-4 animate-spin inline text-gray-400" />}
                        {results[i.id] === 'sent'    && <CheckCircle className="w-4 h-4 inline text-green-600" />}
                        {results[i.id] === 'error'   && <XCircle className="w-4 h-4 inline text-red-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}