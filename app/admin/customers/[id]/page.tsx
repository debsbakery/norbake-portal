import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth';
import RepeatOrderView from './repeat-order-view';

export default async function RepeatOrderPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect('/admin');

  const supabase = await createClient();

  // Get customer info
  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, contact_name')
    .eq('id', id)
    .single();

  if (!customer) redirect('/admin');

  // Get customer's recent orders (last 30 days)
  const { data: recentOrders } = await supabase
    .from('orders')
    .select(`
      id,
      delivery_date,
      total_amount,
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        unit_price,
        product:products (
          id,
          name,
          product_number,
          price,
          unit
        )
      )
    `)
    .eq('customer_id', id)
    .gte('delivery_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('delivery_date', { ascending: false })
    .limit(20);

  return (
    <RepeatOrderView 
      customer={customer} 
      recentOrders={recentOrders || []} 
    />
  );
}