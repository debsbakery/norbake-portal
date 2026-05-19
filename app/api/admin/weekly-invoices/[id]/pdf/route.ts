// app/api/admin/weekly-invoices/[id]/pdf/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateWeeklyInvoicePDF, OrderLineItem } from '@/lib/pdf/weekly-invoice-pdf'
import { buildDayLines } from '@/lib/services/weekly-invoice-service'

interface Params { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch weekly invoice
  const { data: weekly, error: wErr } = await supabase
    .from('weekly_invoices')
    .select(`
      *, customer:customers ( business_name, email, address, phone, abn )
    `)
    .eq('id', params.id)
    .single()

  if (wErr || !weekly) {
    return NextResponse.json({ error: 'Weekly invoice not found' }, { status: 404 })
  }

  // Fetch linked orders
  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', params.id)

  const orderIds = (links ?? []).map((l: any) => l.order_id)

  const { data: orders } = await supabase
    .from('orders')
    .select('id, delivery_date, invoice_number, total_amount')
    .in('id', orderIds)
    .order('delivery_date', { ascending: true })

  // Fetch ALL order items
  const { data: allItems } = await supabase
    .from('order_items')
    .select('order_id, product_name, custom_description, quantity, unit_price, subtotal, gst_applicable')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })

  // Group items by order_id
  const itemsByOrderId = new Map<string, OrderLineItem[]>()
  for (const item of (allItems ?? [])) {
    const orderId = item.order_id as string
    if (!itemsByOrderId.has(orderId)) {
      itemsByOrderId.set(orderId, [])
    }
    itemsByOrderId.get(orderId)!.push({
      product_name:       item.product_name as string,
      custom_description: item.custom_description as string | null,
      quantity:           Number(item.quantity),
      unit_price:         Number(item.unit_price),
      subtotal:           Number(item.subtotal),
      gst_applicable:     item.gst_applicable as boolean,
    })
  }

  // Build dayLines GROUPED by date
  const dayLines = buildDayLines(
    (orders ?? []).map((o: any) => ({
      id:             o.id,
      delivery_date:  o.delivery_date,
      invoice_number: o.invoice_number,
      total_amount:   Number(o.total_amount || 0),
    })),
    itemsByOrderId
  )

  // Bakery details
  const bakery = {
    name:        process.env.RESEND_FROM_NAME ?? 'Norbake',
    email:       process.env.RESEND_FROM_EMAIL ?? 'orders@norbakebroome.com',
    phone:       process.env.NEXT_PUBLIC_BAKERY_PHONE   ?? '',
    address:     process.env.NEXT_PUBLIC_BAKERY_ADDRESS ?? '',
    abn:         process.env.NEXT_PUBLIC_BAKERY_ABN     ?? '',
    bankName:    process.env.NEXT_PUBLIC_BANK_NAME      ?? '',
    bankBSB:     process.env.NEXT_PUBLIC_BANK_BSB       ?? '',
    bankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT   ?? '',
  }

  const pdf = await generateWeeklyInvoicePDF({
    weekly: {
      id:             weekly.id,
      invoice_number: weekly.invoice_number,
      week_start:     weekly.week_start,
      week_end:       weekly.week_end,
      total_amount:   Number(weekly.total_amount),
      gst_amount:     Number(weekly.gst_amount),
      issued_at:      weekly.issued_at,
      revised_at:     weekly.revised_at,
      due_date:       weekly.due_date,
      status:         weekly.status,
    },
    customer: {
      business_name: weekly.customer?.business_name ?? '',
      email:         weekly.customer?.email         ?? '',
      address:       weekly.customer?.address,
      phone:         weekly.customer?.phone,
      abn:           weekly.customer?.abn,
    },
    dayLines,
    bakery,
  })

  const arrayBuffer = pdf.output('arraybuffer')
  const filename    = `weekly-invoice-${String(weekly.invoice_number ?? weekly.id.slice(0,8)).padStart(6,'0')}.pdf`

  return new NextResponse(Buffer.from(arrayBuffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}