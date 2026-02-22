import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import OrderEditView from './order-edit-view';

export default async function EditOrderPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch order with items and products
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        unit_price,
        subtotal,
        gst_applicable,
        product:products (
          id,
          name,
          product_number,
          price,
          unit,
          category,
          is_available
        )
      )
    `)
    .eq('id', id)
    .eq('customer_id', user.id)
    .single();

  if (error || !order) {
    redirect('/portal?error=order-not-found');
  }

  // Check if still editable
  const cutoffTime = order.cutoff_time || '17:00:00';
  const cutoffDateTime = new Date(`${order.delivery_date}T${cutoffTime}`);
  const now = new Date();

  if (now >= cutoffDateTime || order.status !== 'pending') {
    redirect('/portal?error=order-not-editable');
  }

  // Fetch all available products for adding new items
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_available', true)
    .order('product_number');

  return <OrderEditView order={order} products={products || []} />;
}