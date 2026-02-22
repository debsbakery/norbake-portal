import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth';
import RecordPaymentView from './record-payment-view';

export default async function RecordPaymentPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect('/admin');

  const supabase = await createClient();

  // Get all customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, balance')
    .order('business_name');

  return <RecordPaymentView customers={customers || []} />;
}