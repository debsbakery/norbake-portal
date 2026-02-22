import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if order belongs to this customer
    if (order.customer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error('Get order error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await context.params;
    const supabase = await createClient();
    const updates = await request.json();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if order belongs to this customer
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('customer_id, delivery_date, cutoff_time, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.customer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if order is still editable (before cutoff)
    const cutoffTime = order.cutoff_time || '17:00:00';
    const deliveryDateTime = new Date(`${order.delivery_date}T${cutoffTime}`);
    const now = new Date();

    if (now >= deliveryDateTime) {
      return NextResponse.json(
        { error: 'Order editing deadline has passed' },
        { status: 400 }
      );
    }

    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending orders can be edited' },
        { status: 400 }
      );
    }

    // Delete existing order items
    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to update order items' }, { status: 500 });
    }

    // Insert updated items
    if (updates.items && updates.items.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(
        updates.items.map((item: any) => ({
          order_id: orderId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.quantity * item.unit_price,
          gst_applicable: item.gst_applicable || false,
        }))
      );

      if (itemsError) {
        console.error('Insert items error:', itemsError);
        return NextResponse.json({ error: 'Failed to update items' }, { status: 500 });
      }
    }

    // Update order totals
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        total_amount: updates.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update order error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}