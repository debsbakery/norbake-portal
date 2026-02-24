import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import RecordPaymentWithAllocation from './record-payment-with-allocation';

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export default async function RecordPaymentPage() {
  const supabase = await createServiceClient();

  // Check if user is logged in (basic check)
  // You can enhance this with your actual auth check
  
  // Get customers with balances
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, balance')
    .order('business_name');

  // Get unpaid/partially paid orders
// ✅ SIMPLIFIED - Get ALL orders
const { data: invoices } = await supabase
  .from('orders')
  .select('id, delivery_date, total_amount, amount_paid, customer_id')
  .order('delivery_date', { ascending: false });

  return (
    <RecordPaymentWithAllocation 
      customers={customers || []} 
      invoices={invoices || []}
    />
  );
}