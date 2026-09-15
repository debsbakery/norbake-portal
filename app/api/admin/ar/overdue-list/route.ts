export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Overdue invoices across ALL customers, resolved to their source document
// so the existing send endpoints can be reused (they already attach PDFs).
export async function GET() {
  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    // Weekly invoices carry their own due_date
    const { data: weeklies, error: wErr } = await supabase
      .from('weekly_invoices')
      .select(`
        id, invoice_number, week_start, week_end, total_amount, amount_paid,
        due_date, status,
        customer:customers ( id, business_name, email )
      `)
      .lt('due_date', today)
      .order('due_date', { ascending: true })

    if (wErr) {
      return NextResponse.json({ error: 'Weekly query failed: ' + wErr.message }, { status: 500 })
    }

    // Daily invoices have no due_date - derive from delivery_date + payment_terms
    const { data: dailies, error: dErr } = await supabase
      .from('orders')
      .select(`
        id, customer_id, delivery_date, invoice_number, total_amount, amount_paid, status,
        customers ( id, business_name, email, payment_terms )
      `)
      .eq('status', 'invoiced')
      .is('weekly_invoice_id', null)
      .not('invoice_number', 'is', null)
      .gt('total_amount', 0)
      .order('delivery_date', { ascending: true })

    if (dErr) {
      return NextResponse.json({ error: 'Daily query failed: ' + dErr.message }, { status: 500 })
    }

    const round2 = (n: number) => Math.round(n * 100) / 100
    const daysBetween = (from: string) =>
      Math.floor((Date.now() - new Date(from + 'T00:00:00').getTime()) / 86400000)

    const items: any[] = []

    for (const w of (weeklies ?? [])) {
      const balance = round2(Number(w.total_amount || 0) - Number(w.amount_paid || 0))
      if (balance <= 0.01) continue
      const c = w.customer as any
      if (!c?.email) continue
      items.push({
        id:             w.id,
        is_weekly:     true,
        customer_id:    c.id,
        customer_name:  c.business_name ?? '(no name)',
        customer_email: c.email,
        invoice_number: w.invoice_number,
        doc_date:       w.week_end,
        due_date:       w.due_date,
        days_overdue:   daysBetween(w.due_date),
        total_amount:   round2(Number(w.total_amount || 0)),
        balance,
      })
    }

    for (const o of (dailies ?? [])) {
      const c = o.customers as any
      if (!c?.email) continue
      const balance = round2(Number(o.total_amount || 0) - Number(o.amount_paid || 0))
      if (balance <= 0.01) continue

      const terms = Number(c.payment_terms ?? 14)
      const due = new Date(o.delivery_date + 'T00:00:00')
      due.setDate(due.getDate() + terms)
      const dueStr = due.toISOString().split('T')[0]
      if (dueStr >= today) continue

      items.push({
        id:             o.id,
        is_weekly:     false,
        customer_id:    c.id,
        customer_name:  c.business_name ?? '(no name)',
        customer_email: c.email,
        invoice_number: o.invoice_number,
        doc_date:       o.delivery_date,
        due_date:       dueStr,
        days_overdue:   daysBetween(dueStr),
        total_amount:   round2(Number(o.total_amount || 0)),
        balance,
      })
    }

    items.sort((a, b) =>
      a.customer_name.localeCompare(b.customer_name) || b.days_overdue - a.days_overdue
    )

    return NextResponse.json({
      items,
      total_balance: round2(items.reduce((s, i) => s + i.balance, 0)),
      customer_count: new Set(items.map(i => i.customer_id)).size,
    })
  } catch (err: any) {
    console.error('Overdue list error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}