// app/api/admin/weekly-invoices/[id]/pdf/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateWeeklyInvoicePDF, OrderLineItem } from '@/lib/pdf/weekly-invoice-pdf'

interface Params { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch weekly invoice + customer
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

  // Fetch linked order IDs
  const { data: links } = await supabase
    .from('weekly_invoice_orders')
    .select('order_id')
    .eq('weekly_invoice_id', params.id)

  const orderIds = (links ?? []).map((l: any) => l.order_id)

  // Fetch ALL order items — flat list
  const { data: allItems } = await supabase
    .from('order_items')
    .select('product_name, custom_description, quantity, unit_price, subtotal, gst_applicable')
    .in('order_id', orderIds)
    .order('product_name', { ascending: true })

  const items: OrderLineItem[] = (allItems ?? []).map((item: any) => ({
    product_name:       item.product_name,
    custom_description: item.custom_description,
    quantity:           Number(item.quantity),
    unit_price:         Number(item.unit_price),
    subtotal:           Number(item.subtotal),
    gst_applicable:     item.gst_applicable,
  }))

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
    items,
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