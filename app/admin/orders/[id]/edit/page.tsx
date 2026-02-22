import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminOrderEditView from './admin-order-edit-view';
import { checkAdmin } from '@/lib/auth';

export default async function AdminEditOrderPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect('/admin');

  const supabase = await createClient();

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
    .single();

  if (error || !order) {
    redirect('/admin?error=order-not-found');
  }

  // Fetch all available products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_available', true)
    .order('product_number');

  return <AdminOrderEditView order={order} products={products || []} />;
}