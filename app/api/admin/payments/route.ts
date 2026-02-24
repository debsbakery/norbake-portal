export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient();
    const body = await request.json();
    
    const {
      customer_id,
      amount,
      payment_date,
      payment_method,
      reference_number,
      notes,
      allocations = [], // ✅ Get allocations
    } = body;

    if (!customer_id || !amount) {
      return NextResponse.json(
        { error: 'customer_id and amount are required' },
        { status: 400 }
      );
    }

    // Get customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('business_name, contact_name, balance')
      .eq('id', customer_id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // ✅ Insert payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        customer_id,
        amount: parseFloat(amount),
        payment_date,
        payment_method,
        reference_number: reference_number || null,
        notes: notes || null,
        allocated_amount: allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0),
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // ✅ Process allocations to specific invoices
    if (Array.isArray(allocations) && allocations.length > 0) {
      for (const allocation of allocations) {
        if (!allocation.invoice_id || !allocation.amount) continue;

        // Record invoice payment
        await supabase.from('invoice_payments').insert({
          invoice_id: allocation.invoice_id,
          payment_id: payment.id,
          amount: allocation.amount,
        });

        // Update invoice amount_paid
        const { data: invoice } = await supabase
          .from('orders')
          .select('amount_paid')
          .eq('id', allocation.invoice_id)
          .single();

        const newAmountPaid = (invoice?.amount_paid || 0) + allocation.amount;

        await supabase
          .from('orders')
          .update({ amount_paid: newAmountPaid })
          .eq('id', allocation.invoice_id);
      }
    }

    // ✅ Update customer balance
    const newBalance = (customer.balance || 0) - parseFloat(amount);
    await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customer_id);

    console.log('✅ Payment recorded:', {
      customer: customer.business_name || customer.contact_name,
      amount,
      allocations: allocations.length,
    });

    return NextResponse.json({
      payment: {
        id: payment.id,
        customer: customer.business_name || customer.contact_name,
        amount: parseFloat(amount),
        new_balance: newBalance,
        allocations: allocations.length,
      },
    });
  } catch (error: any) {
    console.error('❌ Error recording payment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}