'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Truck, AlertTriangle, Search,
  Plus, Save, Loader2, Trash2,
  TrendingUp, TrendingDown,
} from 'lucide-react'

interface Usage {
  daily_avg: number
  weekly_avg: number
  days_remaining: number | null
  weeks_remaining: number | null
}

interface Ingredient {
  id: string
  name: string
  unit: string
  unit_cost: number
  current_stock: number | null
  reorder_point: number | null
  supplier_id: string | null
  suppliers: { id: string; name: string } | null
  usage: Usage | null
}

interface Receipt {
  id: string
  ingredient_id: string
  supplier_id: string | null
  supplier: string | null
  quantity_kg: number
  unit_cost: number
  total_cost: number
  invoice_ref: string | null
  received_date: string
  notes: string | null
  packs: number | null
  pack_size_kg: number | null
  cost_per_pack: number | null
  ingredients: { id: string; name: string; unit: string } | null
  suppliers: { id: string; name: string } | null
}

interface Supplier {
  id: string
  name: string
}

interface Props {
  ingredients: Ingredient[]
  initialReceipts: Receipt[]
  suppliers: Supplier[]
}

interface DeliveryLine {
  id: string
  ingredient_id: string
  packs: string
  pack_size_kg: string
  cost_per_pack: string
}

function newDeliveryLine(): DeliveryLine {
  return {
    id:            Math.random().toString(36).slice(2),
    ingredient_id: '',
    packs:         '',
    pack_size_kg:  '',
    cost_per_pack: '',
  }
}

function formatDate(d: string) {
  if (!d) return '-'
  const date = new Date(d + 'T00:00:00')
  return [
    date.getDate().toString().padStart(2, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getFullYear(),
  ].join('/')
}

export default function InventoryDashboard({ ingredients, initialReceipts, suppliers }: Props) {
  const router = useRouter()
  const [receipts, setReceipts] = useState(initialReceipts)
  const [tab, setTab]           = useState<'overview' | 'receive' | 'history'>('overview')
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Multi-line delivery state ──────────────────────────────────────────
  const [lines, setLines]                 = useState<DeliveryLine[]>([newDeliveryLine()])
  const [deliverySupplier, setDeliverySupplier] = useState('')
  const [deliveryInvoice, setDeliveryInvoice]   = useState('')
  const [deliveryDate, setDeliveryDate]         = useState(new Date().toISOString().split('T')[0])
  const [deliveryNotes, setDeliveryNotes]       = useState('')
  const [historyFilter, setHistoryFilter]       = useState('')

  // ── Stats ──────────────────────────────────────────────────────────────
  const lowStock = ingredients.filter(i => {
    const days = i.usage?.days_remaining
    if (days !== null && days !== undefined && days <= 7) return true
    if ((i.reorder_point || 0) > 0 && (i.current_stock || 0) <= (i.reorder_point || 0)) return true
    return false
  })

  const withUsage = ingredients.filter(i => i.usage && i.usage.weekly_avg > 0)
  const totalStockValue = ingredients.reduce((sum, i) =>
    sum + ((i.current_stock || 0) * (i.unit_cost || 0)), 0
  )

  const filteredIngredients = ingredients.filter(i => {
    if (!search) return i.usage && i.usage.weekly_avg > 0
    return i.name.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => {
    const aDays = a.usage?.days_remaining ?? 999
    const bDays = b.usage?.days_remaining ?? 999
    return aDays - bDays
  })

  // ── Last receipt map ───────────────────────────────────────────────────
  const lastReceiptMap = useMemo(() => {
    const map: Record<string, Receipt> = {}
    receipts.forEach(r => {
      if (!map[r.ingredient_id]) map[r.ingredient_id] = r
    })
    return map
  }, [receipts])

  // ── Line calculations ─────────────────────────────────────────────────
  function calcLine(line: DeliveryLine) {
    const packs     = parseFloat(line.packs) || 0
    const packSize  = parseFloat(line.pack_size_kg) || 0
    const costPack  = parseFloat(line.cost_per_pack) || 0
    const totalKg   = packs * packSize
    const totalCost = packs * costPack
    const costPerKg = packSize > 0 ? costPack / packSize : 0

    const ingredient  = ingredients.find(i => i.id === line.ingredient_id)
    const currentCost = ingredient ? Number(ingredient.unit_cost) : null
    const lastReceipt = lastReceiptMap[line.ingredient_id]
    const lastCost    = lastReceipt ? Number(lastReceipt.unit_cost) : null

    let changePct: number | null = null
    let changeAbs: number | null = null
    if (currentCost !== null && currentCost > 0 && costPerKg > 0 && currentCost !== costPerKg) {
      changePct = ((costPerKg - currentCost) / currentCost) * 100
      changeAbs = costPerKg - currentCost
    }

    return { packs, packSize, costPack, totalKg, totalCost, costPerKg, ingredient, currentCost, lastReceipt, lastCost, changePct, changeAbs }
  }

  // ── Grand totals ──────────────────────────────────────────────────────
  const validLines = lines.filter(l => l.ingredient_id && parseFloat(l.packs) > 0)
  const grandTotal = validLines.reduce((s, l) => s + calcLine(l).totalCost, 0)
  const grandKg    = validLines.reduce((s, l) => s + calcLine(l).totalKg, 0)
  const increaseCount = validLines.filter(l => { const c = calcLine(l); return c.changePct !== null && c.changePct > 0 }).length
  const decreaseCount = validLines.filter(l => { const c = calcLine(l); return c.changePct !== null && c.changePct < 0 }).length

  // ── Line manipulation ─────────────────────────────────────────────────
  function updateLine(id: string, field: keyof DeliveryLine, value: string) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  function removeLine(id: string) {
    setLines(prev => {
      const filtered = prev.filter(l => l.id !== id)
      return filtered.length === 0 ? [newDeliveryLine()] : filtered
    })
  }

  function addLine() {
    setLines(prev => [...prev, newDeliveryLine()])
  }

  function handleLineIngredient(lineId: string, ingredientId: string) {
    updateLine(lineId, 'ingredient_id', ingredientId)
    const ing = ingredients.find(i => i.id === ingredientId)
    if (ing?.supplier_id && !deliverySupplier) {
      const sup = suppliers.find(s => s.id === ing.supplier_id)
      if (sup) setDeliverySupplier(sup.id)
    }
  }

  // ── Submit all lines ──────────────────────────────────────────────────
  async function handleReceiveAll() {
    const toSubmit = lines.filter(l => {
      const c = calcLine(l)
      return l.ingredient_id && c.totalKg > 0 && c.costPerKg > 0
    })

    if (toSubmit.length === 0) {
      setMessage({ type: 'error', text: 'Add at least one valid line with ingredient, packs, size, and cost' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const results: string[] = []

      for (const line of toSubmit) {
        const c = calcLine(line)

        const res = await fetch('/api/admin/inventory/receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_id:  line.ingredient_id,
            supplier_id:    deliverySupplier || null,
            packs:          c.packs,
            pack_size_kg:   c.packSize,
            cost_per_pack:  c.costPack,
            quantity_kg:    c.totalKg,
            unit_cost:      c.costPerKg,
            total_cost:     c.totalCost,
            invoice_ref:    deliveryInvoice || null,
            received_date:  deliveryDate,
            notes:          deliveryNotes || null,
          }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(`${c.ingredient?.name}: ${data.error || 'Failed'}`)

        let msg = `${c.ingredient!.name}: ${c.packs}×${c.packSize}kg = ${c.totalKg.toFixed(1)}kg @ $${c.costPerKg.toFixed(4)}/kg`
        if (c.changePct !== null) {
          msg += c.changePct > 0
            ? ` 🔴 +${c.changePct.toFixed(1)}%`
            : ` 🟢 ${c.changePct.toFixed(1)}%`
        }
        results.push(msg)
      }

      setMessage({
        type: 'success',
        text: `✅ Recorded ${toSubmit.length} item${toSubmit.length !== 1 ? 's' : ''} — $${grandTotal.toFixed(2)} total\n\n${results.join('\n')}`,
      })

      // Reset form
      setLines([newDeliveryLine()])
      setDeliverySupplier('')
      setDeliveryInvoice('')
      setDeliveryNotes('')

      router.refresh()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ── History cost changes ──────────────────────────────────────────────
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

  const filteredReceipts = historyFilter
    ? receipts.filter(r => r.ingredient_id === historyFilter)
    : receipts

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
          <p className="text-xs text-blue-500 mb-1">Tracked Ingredients</p>
          <p className="text-2xl font-bold text-blue-700">{withUsage.length}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
          <p className="text-xs text-green-500 mb-1">Stock Value</p>
          <p className="text-2xl font-bold text-green-700">${totalStockValue.toFixed(0)}</p>
        </div>
        <div className={`p-4 rounded-lg border text-center ${
          lowStock.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
        }`}>
          <p className="text-xs text-gray-500 mb-1">Low Stock Alerts</p>
          <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>
            {lowStock.length}
          </p>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 text-center">
          <p className="text-xs text-purple-500 mb-1">Deliveries This Month</p>
          <p className="text-2xl font-bold text-purple-700">
            {receipts.filter(r => {
              const d = new Date(r.received_date)
              const now = new Date()
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).length}
          </p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-800">Low Stock — Order Soon</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                {i.name}: {i.current_stock ?? 0} {i.unit}
                {i.usage?.days_remaining != null && ` (~${i.usage.days_remaining}d left)`}
              </span>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-line ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['overview', 'receive', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'
            }`}
          >
            {t === 'overview' && '📊 Stock Overview'}
            {t === 'receive' && '📦 Receive Delivery'}
            {t === 'history' && '📋 Delivery History'}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {tab === 'overview' && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search ingredients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">In Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Weekly Use</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">$/Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIngredients.map(i => {
                  const stock = i.current_stock ?? 0
                  const days  = i.usage?.days_remaining
                  const isLow = days !== null && days !== undefined && days <= 7
                  return (
                    <tr key={i.id} className={`hover:bg-gray-50 ${isLow ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{i.name}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {stock > 0 ? `${stock} ${i.unit}` : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {i.usage?.weekly_avg ? `${i.usage.weekly_avg.toFixed(1)} ${i.unit}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {days !== null && days !== undefined ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            days <= 3 ? 'bg-red-600 text-white' :
                            days <= 7 ? 'bg-red-100 text-red-700' :
                            days <= 14 ? 'bg-orange-100 text-orange-700' :
                            days <= 21 ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {days <= 0 ? 'OUT' : `~${i.usage?.weeks_remaining}w`}
                          </span>
                        ) : stock > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        ${Number(i.unit_cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {(i.suppliers as any)?.name || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ RECEIVE TAB — MULTI-LINE ══ */}
      {tab === 'receive' && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">

          {/* Delivery header */}
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Truck className="h-5 w-5 text-green-700" />
              Record Supplier Delivery
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Date *</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                <select
                  value={deliverySupplier}
                  onChange={e => setDeliverySupplier(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Ref</label>
                <input
                  type="text"
                  value={deliveryInvoice}
                  onChange={e => setDeliveryInvoice(e.target.value)}
                  placeholder="INV-12345"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Line items header */}
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <span className="text-sm font-bold text-blue-900">
              Items ({lines.length})
            </span>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-3 w-3" /> Add Line
            </button>
          </div>

          {/* Column headers (desktop) */}
          <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
            <span className="col-span-3">Ingredient</span>
            <span className="col-span-1 text-center">Packs</span>
            <span className="col-span-1 text-center">Size (kg)</span>
            <span className="col-span-1 text-center">$/Pack</span>
            <span className="col-span-1 text-right">Total kg</span>
            <span className="col-span-1 text-right">$/kg</span>
            <span className="col-span-2 text-center">vs Current</span>
            <span className="col-span-1 text-right">Line Total</span>
            <span className="col-span-1"></span>
          </div>

          {/* Line rows */}
          <div className="divide-y divide-gray-100">
            {lines.map(line => {
              const c = calcLine(line)
              return (
                <div key={line.id} className="grid grid-cols-1 lg:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50">

                  {/* Ingredient */}
                  <div className="lg:col-span-3">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Ingredient</label>
                    <select
                      value={line.ingredient_id}
                      onChange={e => handleLineIngredient(line.id, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select...</option>
                      {ingredients.map(ing => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} (${Number(ing.unit_cost).toFixed(2)}/{ing.unit})
                        </option>
                      ))}
                    </select>
                    {c.lastReceipt && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        Last: ${c.lastCost?.toFixed(4)}/kg ({formatDate(c.lastReceipt.received_date)})
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
                      placeholder="10"
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Pack Size */}
                  <div className="lg:col-span-1">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Size (kg)</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={line.pack_size_kg}
                      onChange={e => updateLine(line.id, 'pack_size_kg', e.target.value)}
                      placeholder="25"
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cost per pack */}
                  <div className="lg:col-span-1">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">$/Pack</label>
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={line.cost_per_pack}
                        onChange={e => updateLine(line.id, 'cost_per_pack', e.target.value)}
                        placeholder="35"
                        className="w-full pl-5 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Total kg */}
                  <div className="lg:col-span-1 text-right">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Total kg</label>
                    <span className={`text-sm font-mono font-semibold ${c.totalKg > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                      {c.totalKg > 0 ? c.totalKg.toFixed(1) : '—'}
                    </span>
                  </div>

                  {/* $/kg */}
                  <div className="lg:col-span-1 text-right">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">$/kg</label>
                    <span className={`text-sm font-mono font-bold ${c.costPerKg > 0 ? 'text-blue-800' : 'text-gray-300'}`}>
                      {c.costPerKg > 0 ? '$' + c.costPerKg.toFixed(4) : '—'}
                    </span>
                  </div>

                  {/* Change */}
                  <div className="lg:col-span-2 text-center">
                    {c.changePct !== null ? (
                      <span className={[
                        'inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full',
                        c.changePct > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
                      ].join(' ')}>
                        {c.changePct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {c.changePct > 0 ? '+' : ''}{c.changePct.toFixed(1)}%
                        <span className="font-normal">
                          (${c.changeAbs! > 0 ? '+' : ''}{c.changeAbs!.toFixed(4)})
                        </span>
                      </span>
                    ) : c.costPerKg > 0 && c.currentCost !== null ? (
                      <span className="text-xs text-gray-400">No change</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </div>

                  {/* Line total */}
                  <div className="lg:col-span-1 text-right">
                    <label className="lg:hidden text-xs font-semibold text-gray-500 mb-1 block">Total</label>
                    <span className={`text-sm font-mono font-bold ${c.totalCost > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {c.totalCost > 0 ? '$' + c.totalCost.toFixed(2) : '—'}
                    </span>
                  </div>

                  {/* Remove */}
                  <div className="lg:col-span-1 flex justify-center">
                    <button type="button" onClick={() => removeLine(line.id)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add line + totals */}
          <div className="px-4 py-3 bg-gray-50 border-t">
            <button type="button" onClick={addLine} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium mb-3">
              <Plus className="h-4 w-4" /> Add another item
            </button>

            {validLines.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex flex-wrap gap-5 text-sm">
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
                    <span className="flex items-center gap-1 text-red-700 font-bold">
                      <TrendingUp className="h-3 w-3" /> {increaseCount} increase{increaseCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {decreaseCount > 0 && (
                    <span className="flex items-center gap-1 text-green-700 font-bold">
                      <TrendingDown className="h-3 w-3" /> {decreaseCount} decrease{decreaseCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <button
                  onClick={handleReceiveAll}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 text-white font-bold rounded-lg disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: '#006A4E' }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : `Record ${validLines.length} Item${validLines.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ HISTORY TAB ══ */}
      {tab === 'history' && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span className="font-semibold text-gray-800">Delivery History</span>
            <select
              value={historyFilter}
              onChange={e => setHistoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All ingredients</option>
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ingredient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Packs</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total kg</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">$/kg</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Change</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total $</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReceipts.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No deliveries recorded</td></tr>
                ) : (
                  filteredReceipts.map(r => {
                    const change = receiptCostChanges[r.id]
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(r.received_date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{(r.ingredients as any)?.name || '-'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{(r.suppliers as any)?.name || r.supplier || '-'}</td>
                        <td className="px-4 py-3 text-right font-mono">{r.packs ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">{r.pack_size_kg ? `${r.pack_size_kg}kg` : '-'}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{Number(r.quantity_kg).toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">${Number(r.unit_cost).toFixed(4)}</td>
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
                        <td className="px-4 py-3 text-right font-mono font-bold text-green-700">${Number(r.total_cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.invoice_ref || '-'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}