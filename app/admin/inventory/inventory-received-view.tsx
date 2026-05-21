'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Trash2, TrendingUp, TrendingDown, Package,
  DollarSign, ChevronDown, ChevronUp, Minus, Save, FileText
} from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
  supplier: string | null
}

interface Receipt {
  id: string
  ingredient_id: string
  supplier: string | null
  quantity_kg: number
  unit_cost: number
  total_cost: number
  invoice_ref: string | null
  received_date: string
  notes: string | null
  created_at: string
  ingredients: {
    id: string
    name: string
    unit: string
  } | null
}

interface Props {
  ingredients: Ingredient[]
  initialReceipts: Receipt[]
}

interface DeliveryLine {
  id: string
  ingredient_id: string
  packs: string
  pack_size_kg: string
  price_per_pack: string
  update_cost: boolean
}

function newLine(): DeliveryLine {
  return {
    id:             Math.random().toString(36).slice(2),
    ingredient_id:  '',
    packs:          '',
    pack_size_kg:   '',
    price_per_pack: '',
    update_cost:    true,
  }
}

export default function InventoryReceivedView({ ingredients, initialReceipts }: Props) {
  const [receipts, setReceipts]     = useState<Receipt[]>(initialReceipts)
  const [lines, setLines]           = useState<DeliveryLine[]>([newLine()])
  const [supplier, setSupplier]     = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [showForm, setShowForm]     = useState(true)
  const [filterIng, setFilterIng]   = useState('')

  // ── Last receipt map for cost comparisons ──────────────────────────────
  const lastReceiptMap = useMemo(() => {
    const map: Record<string, Receipt> = {}
    receipts.forEach(r => {
      if (!map[r.ingredient_id]) map[r.ingredient_id] = r
    })
    return map
  }, [receipts])

  // ── Line calculations ─────────────────────────────────────────────────
  function lineCalc(line: DeliveryLine) {
    const packs      = Number(line.packs) || 0
    const packSizeKg = Number(line.pack_size_kg) || 0
    const pricePack  = Number(line.price_per_pack) || 0
    const totalKg    = packs * packSizeKg
    const totalCost  = packs * pricePack
    const unitCost   = totalKg > 0 ? totalCost / totalKg : 0

    const ingredient = ingredients.find(i => i.id === line.ingredient_id)
    const prevCost   = ingredient ? Number(ingredient.unit_cost) : null
    const lastReceipt = lastReceiptMap[line.ingredient_id]
    const lastCost   = lastReceipt ? Number(lastReceipt.unit_cost) : null

    let changePct: number | null = null
    let changeAbs: number | null = null
    if (prevCost !== null && prevCost > 0 && unitCost > 0 && prevCost !== unitCost) {
      changePct = ((unitCost - prevCost) / prevCost) * 100
      changeAbs = unitCost - prevCost
    }

    return {
      packs, packSizeKg, pricePack, totalKg, totalCost, unitCost,
      ingredient, prevCost, lastReceipt, lastCost, changePct, changeAbs,
    }
  }

  // ── Grand totals ──────────────────────────────────────────────────────
  const validLines  = lines.filter(l => l.ingredient_id && Number(l.packs) > 0)
  const grandTotal  = validLines.reduce((s, l) => s + lineCalc(l).totalCost, 0)
  const grandKg     = validLines.reduce((s, l) => s + lineCalc(l).totalKg, 0)
  const increaseCount = validLines.filter(l => {
    const c = lineCalc(l); return c.changePct !== null && c.changePct > 0
  }).length
  const decreaseCount = validLines.filter(l => {
    const c = lineCalc(l); return c.changePct !== null && c.changePct < 0
  }).length

  // ── Line manipulation ─────────────────────────────────────────────────
  function updateLine(id: string, field: keyof DeliveryLine, value: any) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  function removeLine(id: string) {
    setLines(prev => {
      const filtered = prev.filter(l => l.id !== id)
      return filtered.length === 0 ? [newLine()] : filtered
    })
  }

  function addLine() {
    setLines(prev => [...prev, newLine()])
  }

  function handleIngredientSelect(lineId: string, ingredientId: string) {
    const ing = ingredients.find(i => i.id === ingredientId)
    updateLine(lineId, 'ingredient_id', ingredientId)
    // Auto-fill supplier if empty and ingredient has one
    if (ing?.supplier && !supplier) {
      setSupplier(ing.supplier)
    }
  }

  // ── Submit all lines ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const toSubmit = lines.filter(l => {
      const c = lineCalc(l)
      return l.ingredient_id && c.totalKg > 0 && c.unitCost > 0
    })

    if (toSubmit.length === 0) {
      setError('Add at least one valid line item')
      return
    }

    // Validate all lines
    for (const line of toSubmit) {
      const c = lineCalc(line)
      if (!c.ingredient) {
        setError(`Invalid ingredient on one or more lines`)
        return
      }
    }

    setSaving(true)

    try {
      const results: string[] = []
      let savedCount = 0

      for (const line of toSubmit) {
        const c = lineCalc(line)

        const res = await fetch('/api/admin/ingredient-receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_id: line.ingredient_id,
            supplier:      supplier || null,
            quantity_kg:   c.totalKg,
            unit_cost:     c.unitCost,
            invoice_ref:   invoiceRef || null,
            received_date: receivedDate,
            notes:         notes || null,
            update_cost:   line.update_cost,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(`${c.ingredient?.name}: ${json.error}`)

        savedCount++

        let line_msg = `${c.ingredient!.name}: ${c.packs}×${c.packSizeKg}kg = ${c.totalKg}kg @ $${c.unitCost.toFixed(4)}/kg`
        if (c.changePct !== null) {
          const dir = c.changePct > 0 ? '🔴 +' : '🟢 '
          line_msg += ` ${dir}${c.changePct.toFixed(1)}%`
        }
        if (line.update_cost) line_msg += ' ✓ cost updated'
        results.push(line_msg)
      }

      setSuccess(
        `✅ Recorded ${savedCount} item${savedCount !== 1 ? 's' : ''} — $${grandTotal.toFixed(2)} total\n\n` +
        results.join('\n')
      )

      // Reset form
      setLines([newLine()])
      setSupplier('')
      setInvoiceRef('')
      setNotes('')

      // Refresh receipts
      const refreshRes = await fetch('/api/admin/ingredient-receipts')
      const refreshJson = await refreshRes.json()
      if (refreshJson.data) setReceipts(refreshJson.data)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete receipt ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Delete this receipt record?')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/admin/ingredient-receipts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setReceipts(prev => prev.filter(r => r.id !== id))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  // ── History calculations ──────────────────────────────────────────────
  const receiptCostChanges = useMemo(() => {
    const changes: Record<string, { diff: number; pct: number } | null> = {}
    const byIngredient: Record<string, Receipt[]> = {}
    receipts.forEach(r => {
      if (!byIngredient[r.ingredient_id]) byIngredient[r.ingredient_id] = []
      byIngredient[r.ingredient_id].push(r)
    })
    Object.values(byIngredient).forEach(ingReceipts => {
      for (let i = 0; i < ingReceipts.length; i++) {
        const current  = ingReceipts[i]
        const previous = ingReceipts[i + 1]
        if (previous) {
          const cc = Number(current.unit_cost)
          const pc = Number(previous.unit_cost)
          if (pc > 0 && cc !== pc) {
            changes[current.id] = { diff: cc - pc, pct: ((cc - pc) / pc) * 100 }
          } else {
            changes[current.id] = null
          }
        } else {
          changes[current.id] = null
        }
      }
    })
    return changes
  }, [receipts])

  const filteredReceipts = filterIng
    ? receipts.filter(r => r.ingredient_id === filterIng)
    : receipts

  const totalSpend = filteredReceipts.reduce((s, r) => s + Number(r.total_cost ?? 0), 0)
  const totalKgAll = filteredReceipts.reduce((s, r) => s + Number(r.quantity_kg ?? 0), 0)

  const historyIncreases = filteredReceipts.filter(r => {
    const c = receiptCostChanges[r.id]; return c && c.diff > 0
  }).length
  const historyDecreases = filteredReceipts.filter(r => {
    const c = receiptCostChanges[r.id]; return c && c.diff < 0
  }).length

  // ── Already-used ingredients (for visual hint) ────────────────────────
  const usedIngredientIds = new Set(lines.map(l => l.ingredient_id).filter(Boolean))

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════
          MULTI-LINE DELIVERY FORM
         ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-700" />
            <span className="font-bold text-gray-800">Record Supplier Delivery</span>
          </div>
          {showForm ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold whitespace-pre-line">{success}</div>
            )}

            {/* ── Delivery header ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Received Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={e => setReceivedDate(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="e.g. Allied Mills"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice / Docket Ref</label>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={e => setInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-12345"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* ── Line items ── */}
            <div className="border border-blue-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-blue-900 text-sm">Delivery Items</span>
                  <span className="ml-2 text-xs text-blue-600">({lines.length} line{lines.length !== 1 ? 's' : ''})</span>
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add Line
                </button>
              </div>

              {/* Column headers */}
              <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                <span className="col-span-3">Ingredient</span>
                <span className="col-span-1 text-center">Packs</span>
                <span className="col-span-1 text-center">Size (kg)</span>
                <span className="col-span-1 text-center">$/Pack</span>
                <span className="col-span-1 text-right">Total kg</span>
                <span className="col-span-1 text-right">$/kg</span>
                <span className="col-span-2 text-center">Change</span>
                <span className="col-span-1 text-center">Update</span>
                <span className="col-span-1"></span>
              </div>

              {/* Line rows */}
              <div className="divide-y divide-gray-100">
                {lines.map((line, idx) => {
                  const c = lineCalc(line)
                  return (
                    <div key={line.id} className="grid grid-cols-1 lg:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50">

                      {/* Ingredient select */}
                      <div className="lg:col-span-3">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Ingredient</label>
                        <select
                          value={line.ingredient_id}
                          onChange={e => handleIngredientSelect(line.id, e.target.value)}
                          required
                          className={[
                            'w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500',
                            usedIngredientIds.has(line.ingredient_id) && lines.filter(l => l.ingredient_id === line.ingredient_id).length > 1
                              ? 'border-orange-300 bg-orange-50'
                              : 'border-gray-300',
                          ].join(' ')}
                        >
                          <option value="">Select...</option>
                          {ingredients.map(ing => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} (${Number(ing.unit_cost).toFixed(4)}/{ing.unit})
                            </option>
                          ))}
                        </select>
                        {c.lastReceipt && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            Last: ${c.lastCost?.toFixed(4)}/kg ({c.lastReceipt.received_date})
                          </p>
                        )}
                      </div>

                      {/* Packs */}
                      <div className="lg:col-span-1">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Packs</label>
                        <input
                          type="number" min="1" step="1"
                          value={line.packs}
                          onChange={e => updateLine(line.id, 'packs', e.target.value)}
                          placeholder="42"
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Pack Size */}
                      <div className="lg:col-span-1">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Size (kg)</label>
                        <input
                          type="number" min="0.001" step="0.001"
                          value={line.pack_size_kg}
                          onChange={e => updateLine(line.id, 'pack_size_kg', e.target.value)}
                          placeholder="25"
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Price per pack */}
                      <div className="lg:col-span-1">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">$/Pack</label>
                        <div className="relative">
                          <span className="absolute left-2 top-2 text-gray-400 text-sm">$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={line.price_per_pack}
                            onChange={e => updateLine(line.id, 'price_per_pack', e.target.value)}
                            placeholder="25"
                            className="w-full pl-5 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Total kg (calc) */}
                      <div className="lg:col-span-1 text-right">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Total kg</label>
                        <span className={[
                          'text-sm font-mono font-semibold',
                          c.totalKg > 0 ? 'text-gray-800' : 'text-gray-300',
                        ].join(' ')}>
                          {c.totalKg > 0 ? c.totalKg.toFixed(1) : '—'}
                        </span>
                      </div>

                      {/* Unit cost (calc) */}
                      <div className="lg:col-span-1 text-right">
                        <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">$/kg</label>
                        <span className={[
                          'text-sm font-mono font-bold',
                          c.unitCost > 0 ? 'text-blue-800' : 'text-gray-300',
                        ].join(' ')}>
                          {c.unitCost > 0 ? '$' + c.unitCost.toFixed(4) : '—'}
                        </span>
                      </div>

                      {/* Change indicator */}
                      <div className="lg:col-span-2 text-center">
                        {c.changePct !== null ? (
                          <span className={[
                            'inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full',
                            c.changePct > 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700',
                          ].join(' ')}>
                            {c.changePct > 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />
                            }
                            {c.changePct > 0 ? '+' : ''}{c.changePct.toFixed(1)}%
                            <span className="font-normal ml-1">
                              (${c.changeAbs! > 0 ? '+' : ''}{c.changeAbs!.toFixed(4)})
                            </span>
                          </span>
                        ) : c.unitCost > 0 && c.prevCost !== null ? (
                          <span className="text-xs text-gray-400">No change</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>

                      {/* Update cost checkbox */}
                      <div className="lg:col-span-1 flex justify-center">
                        <label className="flex items-center gap-1 cursor-pointer" title="Update ingredient cost">
                          <input
                            type="checkbox"
                            checked={line.update_cost}
                            onChange={e => updateLine(line.id, 'update_cost', e.target.checked)}
                            className="w-4 h-4 accent-green-600"
                          />
                          <span className="lg:hidden text-xs text-gray-600">Update cost</span>
                        </label>
                      </div>

                      {/* Remove */}
                      <div className="lg:col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                    </div>
                  )
                })}
              </div>

              {/* Add line button (bottom) */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus className="h-4 w-4" /> Add another item
                </button>
              </div>
            </div>

            {/* ── Delivery totals ── */}
            {validLines.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-green-700">Items:</span>
                    <span className="ml-1 font-bold text-green-900">{validLines.length}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Total kg:</span>
                    <span className="ml-1 font-bold text-green-900">{grandKg.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Total cost:</span>
                    <span className="ml-1 font-bold text-green-900">${grandTotal.toFixed(2)}</span>
                  </div>
                  {increaseCount > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-red-600" />
                      <span className="text-red-700 font-bold">{increaseCount} increase{increaseCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {decreaseCount > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-green-600" />
                      <span className="text-green-700 font-bold">{decreaseCount} decrease{decreaseCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving || validLines.length === 0}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: '#006A4E' }}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : `Record ${validLines.length} Item${validLines.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}

          </form>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DELIVERY HISTORY
         ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-800">Delivery History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 100 receipts</p>
          </div>
          <select
            value={filterIng}
            onChange={e => setFilterIng(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All ingredients</option>
            {ingredients.map(ing => (
              <option key={ing.id} value={ing.id}>{ing.name}</option>
            ))}
          </select>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200 border-b border-gray-200">
          <div className="px-5 py-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Total Received</p>
              <p className="font-bold text-gray-800">{totalKgAll.toFixed(1)} kg</p>
            </div>
          </div>
          <div className="px-5 py-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Total Spend</p>
              <p className="font-bold text-gray-800">${totalSpend.toFixed(2)}</p>
            </div>
          </div>
          <div className="px-5 py-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-400" />
            <div>
              <p className="text-xs text-gray-500">Price Increases</p>
              <p className="font-bold text-red-600">{historyIncreases}</p>
            </div>
          </div>
          <div className="px-5 py-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-gray-500">Price Decreases</p>
              <p className="font-bold text-green-600">{historyDecreases}</p>
            </div>
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No delivery records yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Ingredient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Ref</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Qty (kg)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Unit Cost</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Change</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReceipts.map(r => {
                  const change = receiptCostChanges[r.id]
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.received_date}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.ingredients?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.supplier ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.invoice_ref ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(r.quantity_kg).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">${Number(r.unit_cost).toFixed(4)}</td>
                      <td className="px-4 py-3 text-center">
                        {change ? (
                          <span className={[
                            'inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
                            change.diff > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
                          ].join(' ')}>
                            {change.diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {change.diff > 0 ? '+' : ''}{change.pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">${Number(r.total_cost).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="text-red-400 hover:text-red-600 disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}