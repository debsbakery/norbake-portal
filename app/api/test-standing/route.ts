export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  
  // Simple query first
  const { data: simple, error: simpleErr } = await supabase
    .from('standing_orders')
    .select('id, delivery_days, active')
    .limit(3)

  // Full query like the page uses
  const { data: full, error: fullErr } = await supabase
    .from('standing_orders')
    .select(`
      *,
      customer:customers(id, business_name, email, contact_name, phone),
      items:standing_order_items(id, product_id, quantity, product:products(id, name, price, code))
    `)
    .limit(3)

  return NextResponse.json({
    simple: { count: simple?.length, error: simpleErr?.message, data: simple },
    full: { count: full?.length, error: fullErr?.message, data: full },
  })
}