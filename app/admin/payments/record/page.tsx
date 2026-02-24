import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import RecordPaymentWithAllocation from './record-payment-with-allocation';

export default async function RecordPaymentPage() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  // Get customers with balances
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, balance')
    .order('business_name');

  // Get unpaid/partially paid orders
  const { data: invoices } = await supabase
    .from('orders')
    .select('id, order_number, delivery_date, total_amount, amount_paid, customer_id')
    .or('amount_paid.is.null,amount_paid.lt.total_amount')
    .order('delivery_date', { ascending: false })
    .limit(100);

  return (
    <RecordPaymentWithAllocation 
      customers={customers || []} 
      invoices={invoices || []}
    />
  );
}