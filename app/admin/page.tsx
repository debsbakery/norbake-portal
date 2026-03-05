import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminClientView from './admin-client-view'

export default async function AdminPage() {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) redirect('/login')

  const userRole = user.user_metadata?.role

  if (userRole !== 'admin') redirect('/portal')

  // Fetch pending customer count
  const adminClient = createAdminClient()
  const { count: pendingCount } = await adminClient
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return <AdminClientView pendingCount={pendingCount ?? 0} />
}