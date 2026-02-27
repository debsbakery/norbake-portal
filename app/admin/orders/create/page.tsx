'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ArrowLeft, Search, ChevronDown, X, ClipboardList } from 'lucide-react'

interface Customer {
  id: string
  business_name: string
  email: string
  address: string
  abn: string
  payment_terms: number
  balance: number
}

interface Product {
  id: string
  name: string
  code: string
  price: number
  unit_price: number
  gst_applicable: boolean
}

interface LineItem {
  id: string
  productId: string
  productName: string
  productCode: string
  quantity: number
  unitPrice: number
  gstApplicable: boolean
}

interface SelectOption {
  value: string
  label: string
  badge?: string
  sublabel?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

// ── Searchable Select ─────────────────────────────────────────────────────────

function SearchableSelect({
  options, value, onChange, placeholder = 'Search...', disabled = false,
}: {
  options: SelectOption[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)
  const selected          = options.find(o => o.value === value)

  const filtered = query.trim() === '' ? options : options.filter(o => {
    const q = query.toLowerCase()
    return (
      String(o.label    ?? '').toLowerCase().includes(q) ||
      String(o.badge    ?? '').toLowerCase().includes(q) ||
      String(o.sublabel ?? '').toLowerCase().includes(q)
    )
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={[
          'w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 text-sm text-left bg-white transition-colors focus:outline-none',
          disabled ? 'bg-gray-50 cursor-not-allowed text-gray-400' : 'cursor-pointer hover:border-gray-400',
          open ? 'border-green-700 ring-2 ring-green-100' : 'border-gray-300',
        ].join(' ')}
      >
        <span className="flex-1 truncate flex items-center gap-2">
          {selected ? (
            <>
              {selected.badge && (
                <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">
                  {selected.badge}
                </span>
              )}
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              onMouseDown={e => { e.stopPropagation(); onChange('') }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={['h-4 w-4 text-gray-400 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-md shadow-xl flex flex-col max-h-72">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-green-600"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">No results</div>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={() => { onChange(opt.value); setOpen(false); setQuery('') }}
                className={[
                  'w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-b border-gray-50 hover:bg-green-50 transition-colors',
                  opt.value === value ? 'bg-green-50 font-semibold' : '',
                ].join(' ')}
              >
                {opt.badge && (
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 shrink-0 min-w-[2.5rem] text-center">
                    {opt.badge}
                  </span>
                )}
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && <span className="text-xs text-gray-400 truncate">{opt.sublabel}</span>}
                </span>
              </button>
            ))}
          </div>
          {query && (
            <div className="px-3 py-1 text-xs text-gray-400 border-t bg-gray-50">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminCreateOrderPage() {
  const supabase = createClient()

  const [customers,        setCustomers]        = useState<Customer[]>([])
  const [products,         setProducts]         = useState<Product[]>([])
  const [lineItems,        setLineItems]         = useState<LineItem[]>([])
  const [loading,          setLoading]           = useState(false)
  const [error,            setError]             = useState<string | null>(null)
  const [success,          setSuccess]           = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer]  = useState<Customer | null>(null)

  const [form, setForm] = useState({
    customerId:          '',
    deliveryDate:        new Date().toISOString().split('T')[0],
    purchaseOrderNumber: '',
    docketNumber:        '',
    notes:               '',
    source:              'phone',  // phone | email | fax | walkin
  })

  useEffect(() => {
    supabase.from('customers').select('*').eq('status', 'active').order('business_name')
      .then(({ data }) => { if (data) setCustomers(data) })
    supabase.from('products').select('*').order('code')
      .then(({ data }) => { if (data) setProducts(data) })
  }, [])

  // ── Options ────────────────────────────────────────────────────────────────

  const customerOptions: SelectOption[] = customers.map(c => ({
    value:    c.id,
    label:    c.business_name || c.email,
    sublabel: `Balance: ${fmt(c.balance || 0)}`,
  }))

  const productOptions: SelectOption[] = products.map(p => {
    const code  = p.code || ''
    const price = p.unit_price || p.price || 0
    return {
      value:    p.id,
      label:    p.name,
      badge:    code,
      sublabel: `${fmt(price)} | ${p.gst_applicable ? 'GST' : 'No GST'}`,
    }
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleCustomerChange(id: string) {
    const c = customers.find(c => c.id === id) || null
    setSelectedCustomer(c)
    setForm(f => ({ ...f, customerId: id }))
  }

  function addLineItem() {
    setLineItems(prev => [...prev, {
      id:           Math.random().toString(36).slice(2),
      productId:    '',
      productName:  '',
      productCode:  '',
      quantity:     1,
      unitPrice:    0,
      gstApplicable: false,
    }])
  }

  function updateLineItem(id: string, field: string, value: any) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item
      if (field === 'productId') {
        if (!value) return { ...item, productId: '', productName: '', productCode: '', unitPrice: 0 }
        const p = products.find(p => p.id === value)
        if (!p) return item
        return {
          ...item,
          productId:    p.id,
          productName:  p.name,
          productCode:  p.code || '',
          unitPrice:    p.unit_price || p.price || 0,
          gstApplicable: p.gst_applicable ?? false,
        }
      }
      return { ...item, [field]: value }
    }))
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  // ── Calculations ───────────────────────────────────────────────────────────

  const subtotal   = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const gstTotal   = lineItems.reduce((s, i) => i.gstApplicable ? s + i.quantity * i.unitPrice * 0.1 : s, 0)
  const grandTotal = subtotal + gstTotal

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (!form.customerId)   throw new Error('Please select a customer')
      if (!lineItems.length)  throw new Error('Please add at least one product')
      if (lineItems.some(i => !i.productId || i.quantity <= 0))
        throw new Error('Please complete all line items')

      const customer = selectedCustomer!

      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id:            form.customerId,
          customer_email:         customer.email,
          customer_business_name: customer.business_name,
          customer_address:       customer.address || null,
          customer_abn:           customer.abn     || null,
          delivery_date:          form.deliveryDate,
          total_amount:           grandTotal,
          status:                 'confirmed',   // goes to production queue
          source:                 form.source,
          notes:                  form.notes               || null,
          purchase_order_number:  form.purchaseOrderNumber || null,
          docket_number:          form.docketNumber        || null,
        })
        .select()
        .single()

      if (orderError) throw new Error(`Order failed: ${orderError.message}`)

      // Create order items
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(lineItems.map(item => ({
          order_id:      newOrder.id,
          product_id:    item.productId,
          product_name:  item.productName,
          quantity:      item.quantity,
          unit_price:    item.unitPrice,
          subtotal:      item.quantity * item.unitPrice * (item.gstApplicable ? 1.1 : 1),
          gst_applicable: item.gstApplicable,
        })))

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', newOrder.id)
        throw new Error(`Items failed: ${itemsError.message}`)
      }

      setSuccess(`Order created for ${customer.business_name} — delivery ${form.deliveryDate}. Total: ${fmt(grandTotal)}`)
      setLineItems([])
      setSelectedCustomer(null)
      setForm(f => ({
        ...f,
        customerId:          '',
        purchaseOrderNumber: '',
        docketNumber:        '',
        notes:               '',
      }))

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">

        <a
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: '#CE1126' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </a>

        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#006A4E' }}>
            <ClipboardList className="h-8 w-8" /> Create Order
          </h1>
          <p className="text-gray-600 mt-1">
            Enter phone, email or walk-in orders — they go to production then batch invoicing
          </p>
        </div>

        {error   && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
            <div className="mt-2 flex gap-3">
              <a href="/admin/production" className="text-green-700 underline font-medium">Go to Production</a>
              <a href="/admin/orders/create" className="text-green-700 underline font-medium">Create Another Order</a>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Customer + Delivery Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-bold text-lg mb-4">Order Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={customerOptions}
                  value={form.customerId}
                  onChange={handleCustomerChange}
                  placeholder="Search customer..."
                />
                {selectedCustomer && (
                  <p className="text-xs text-gray-500 mt-1">
                    Balance: <span className={selectedCustomer.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{fmt(selectedCustomer.balance || 0)}</span>
                    {' | '}{selectedCustomer.payment_terms || 30} day terms
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.deliveryDate}
                  required
                  onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Source</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                >
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="fax">Fax</option>
                  <option value="walkin">Walk-in</option>
                  <option value="online">Online</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
                <input
                  type="text"
                  value={form.purchaseOrderNumber}
                  onChange={e => setForm(f => ({ ...f, purchaseOrderNumber: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Docket Number</label>
                <input
                  type="text"
                  value={form.docketNumber}
                  onChange={e => setForm(f => ({ ...f, docketNumber: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                  placeholder="Optional"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500"
                  rows={2}
                  placeholder="Special instructions..."
                />
              </div>

            </div>
          </div>

          {/* Products */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Products</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium hover:opacity-90"
                style={{ backgroundColor: '#006A4E' }}
              >
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
                Click Add Product to start the order
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 pb-1 border-b px-1">
                  <span className="col-span-5">Product</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2">Unit $</span>
                  <span className="col-span-1">GST</span>
                  <span className="col-span-1 text-right">Total</span>
                  <span className="col-span-1"></span>
                </div>

                {lineItems.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded">
                    <div className="col-span-5">
                      <SearchableSelect
                        options={productOptions}
                        value={item.productId}
                        onChange={val => updateLineItem(item.id, 'productId', val)}
                        placeholder="Select product..."
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={item.quantity}
                        onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <input
                        type="checkbox"
                        checked={item.gstApplicable}
                        onChange={e => updateLineItem(item.id, 'gstApplicable', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="col-span-1 text-right text-sm font-mono">
                      {fmt(item.quantity * item.unitPrice * (item.gstApplicable ? 1.1 : 1))}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div className="border-t pt-3 mt-2 space-y-1 text-right">
                  <div className="text-sm text-gray-600">
                    Subtotal: <span className="font-mono font-medium ml-2">{fmt(subtotal)}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    GST (10%): <span className="font-mono font-medium ml-2">{fmt(gstTotal)}</span>
                  </div>
                  <div className="text-xl font-bold" style={{ color: '#006A4E' }}>
                    Total: {fmt(grandTotal)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-3 pb-8">
            <button
              type="submit"
              disabled={loading || !lineItems.length || !form.customerId}
              className="flex-1 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#006A4E' }}
            >
              {loading ? 'Creating Order...' : 'Create Order'}
            </button>
            <a
              href="/admin"
              className="px-6 py-3 rounded-md border border-gray-300 hover:bg-gray-50 text-sm font-medium text-center"
            >
              Cancel
            </a>
          </div>

        </form>
      </div>
    </div>
  )
}