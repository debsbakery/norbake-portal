import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth';
import CutoffSettingsView from './cutoff-settings-view';

export default async function CutoffSettingsPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect('/admin');

  const supabase = await createClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, default_cutoff_time')
    .eq('id', id)
    .single();

  const { data: overrides } = await supabase
    .from('customer_cutoff_overrides')
    .select('*')
    .eq('customer_id', id);

  if (!customer) redirect('/admin');

  return <CutoffSettingsView customer={customer} overrides={overrides || []} />;
}