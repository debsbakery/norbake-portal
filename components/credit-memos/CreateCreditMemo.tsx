'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Trash2 } from 'lucide-react'

interface Props {
  customerId: string
  onSuccess?: () => void
}

interface LineItem {
  product_id: string
  product_name: string
  product_code: string
  quantity: number
  unit_price: number
  credit_percent: number
  gst_applicable: boolean
  credit_type: 'product_credit' | 'stale_return'
}

export default function CreateCreditMemo({ customerId, onSuccess }: Props) {
  const [products, setProducts]     = useState<any[]>([])
  const [creditType, setCreditType] = useState<'product_credit' | 'stale_return'>('product_credit')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState<LineItem[]>([])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(d => setProducts(d.data || []))
  }, [])

  const addLine = () => {
    setItems(prev => [...prev, {
      product_id: '', product_name: '', product_code: '',
      quantity: 1, unit_price: 0, credit_percent: 100,
      gst_applicable: true, credit_type: creditType,
    }])
  }

  const updateLine = (index: number, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      if (field === 'product_id') {
        const product = products.find(p => p.id === value)
        return {
          ...item,
          product_id:    value,
          product_name:  product?.name || '',
          product_code:  product?.code || product?.product_code?.toString() || '',
          unit_price:    product?.unit_price || product?.price || 0,
          gst_applicable: product?.gst_applicable ?? true,
        }
      }
      return { ...item, [field]: value }
    }))
  }

  const removeLine = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const calcLine = (item: LineItem) => {
    const base = item.quantity * item.unit_price * (item.credit_percent / 100)
    const gst  = item.gst_applicable ? base * 0.1 : 0
    return { base, gst, total: base + gst }
  }

  const totals = items.reduce((acc, item) => {
    const { base, gst, total } = calcLine(item)
    return { subtotal: acc.subtotal + base, gst: acc.gst + gst, total: acc.total + total }
  }, { subtotal: 0, gst: 0, total: 0 })

  const handleSubmit = async () => {
    if (!items.length) return alert('Add at least one item')
    setSaving(true)
    try {
      const res = await fetch('/api/credit-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          credit_type: creditType,
          notes,
          items: items.map(item => ({ ...item, credit_type: item.credit_type || creditType })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      alert('Credit memo created successfully')
      setItems([])
      setNotes('')
      onSuccess?.()
    } catch (err: any) {
      alert(`Failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <h3 className="text-lg font-semibold" style={{ color: '#006A4E' }}>
        New Credit Memo
      </h3>

      {/* Credit type */}
      <div className="flex gap-3">
        {(['product_credit', 'stale_return'] as const).map(type => (
          <button
            key={type}
            onClick={() => setCreditType(type)}
            className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
              creditType === type
                ? 'bg-green-700 text-white border-green-700'
                : 'border-gray-300 text-gray-600 hover:border-green-600'
            }`}
          >
            {type === 'product_credit' ? 'Product Credit' : 'Stale Return'}
          </button>
        ))}
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
          <span className="col-span-4">Product</span>
          <span className="col-span-1">Qty</span>
          <span className="col-span-2">Unit Price</span>
          <span className="col-span-1">Credit %</span>
          <span className="col-span-1">GST</span>
          <span className="col-span-2">Line Total</span>
          <span className="col-span-1"></span>
        </div>

        {items.map((item, i) => {
          const { total } = calcLine(item)
          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.product_id}
                  onChange={e => updateLine(i, 'product_id', e.target.value)}
                >
                  <option value="">Select product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1">
                <input
                  type="number" min="0.1" step="0.1"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.quantity}
                  onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value))}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number" min="0" step="0.01"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.unit_price}
                  onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value))}
                />
              </div>
              <div className="col-span-1">
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.credit_percent}
                  onChange={e => updateLine(i, 'credit_percent', parseFloat(e.target.value))}
                >
                  <option value={100}>100%</option>
                  <option value={75}>75%</option>
                  <option value={50}>50%</option>
                  <option value={25}>25%</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-center">
                <input
                  type="checkbox"
                  checked={item.gst_applicable}
                  onChange={e => updateLine(i, 'gst_applicable', e.target.checked)}
                />
              </div>
              <div className="col-span-2 text-sm text-red-600 font-medium">
                ({`$${total.toFixed(2)}`})
              </div>
              <div className="col-span-1">
                <button onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}<Button variant="outline" size="sm" onClick={addLine} className="gap-1 mt-2">
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {/* Notes */}
      <textarea
        className="w-full border rounded px-3 py-2 text-sm"
        rows={2}
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />

      {/* Totals */}
      {items.length > 0 && (
        <div className="bg-gray-50 rounded p-3 text-sm space-y-1 text-right">
          <div>Subtotal: <span className="text-red-600">({`$${totals.subtotal.toFixed(2)}`})</span></div>
          <div>GST: <span className="text-red-600">({`$${totals.gst.toFixed(2)}`})</span></div>
          <div className="font-bold text-base">
            Total Credit: <span className="text-red-600">({`$${totals.total.toFixed(2)}`})</span>
          </div>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={saving || !items.length}
        style={{ backgroundColor: '#006A4E', color: 'white' }}
        className="gap-2"
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Issue Credit Memo'}
      </Button>
    </div>
  )
}