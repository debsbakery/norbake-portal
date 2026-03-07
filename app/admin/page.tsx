import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminClientView from './admin-client-view'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const userRole = user.user_metadata?.role
  if (userRole !== 'admin') redirect('/portal')

  const adminClient = createAdminClient()

  // ── Pending customer count ─────────────────────────────────────
  const { count: pendingCount } = await adminClient
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  // ── Current week (Sun–Sat, Brisbane UTC+10) ────────────────────
  const nowBrisbane = new Date(Date.now() + 10 * 60 * 60 * 1000)
  const day = nowBrisbane.getUTCDay() // 0=Sun
  const sunday = new Date(nowBrisbane)
  sunday.setUTCDate(nowBrisbane.getUTCDate() - day)
  const weekStart = sunday.toISOString().split('T')[0]
  const saturday = new Date(sunday)
  saturday.setUTCDate(sunday.getUTCDate() + 6)
  const weekEnd = saturday.toISOString().split('T')[0]

  // ── Fetch order items to calculate ex-GST ─────────────────────
  const { data: weekItems } = await adminClient
    .from('order_items')
    .select(`
      subtotal,
      gst_applicable,
      orders!inner ( delivery_date, status )
    `)
    .in('orders.status', ['invoiced', 'pending'])
    .gte('orders.delivery_date', weekStart)
    .lte('orders.delivery_date', weekEnd)

  // Ex-GST = subtotal (order_items.subtotal is already ex-GST)
  const weekRevenue = (weekItems ?? []).reduce(
    (sum, item) => sum + Number(item.subtotal ?? 0), 0
  )

  return (
    <AdminClientView
      pendingCount={pendingCount ?? 0}
      weekRevenue={weekRevenue}
      weekStart={weekStart}
      weekEnd={weekEnd}
    />
  )
}