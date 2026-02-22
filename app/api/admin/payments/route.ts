import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    console.log('💰 Payment API called');
    
    const isAdmin = await checkAdmin();
    if (!isAdmin) {
      console.error('❌ Not admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const paymentData = await request.json();

    console.log('📝 Payment data received:', {
      customer_id: paymentData.customer_id,
      amount: paymentData.amount,
      payment_date: paymentData.payment_date,
      payment_method: paymentData.payment_method,
    });

    // Validate required fields
    if (!paymentData.customer_id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }
    if (!paymentData.amount || paymentData.amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    // Insert payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        customer_id: paymentData.customer_id,
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number || null,
        notes: paymentData.notes || null,
        recorded_by: null, // Explicitly set to null since we don't track this
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError) {
      console.error('❌ Payment insert error:', {
        message: paymentError.message,
        details: paymentError.details,
        hint: paymentError.hint,
        code: paymentError.code,
      });
      return NextResponse.json({ 
        error: paymentError.message,
        details: paymentError.details 
      }, { status: 500 });
    }

    console.log('✅ Payment inserted:', payment.id);

    // Update customer balance
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('balance')
        .eq('id', paymentData.customer_id)
        .single();

      if (customerError) {
        console.error('⚠️ Customer fetch error:', customerError);
        return NextResponse.json({ 
          success: true, 
          payment,
          warning: 'Payment recorded but balance not updated: ' + customerError.message
        });
      }

      if (customer) {
        const oldBalance = customer.balance || 0;
        const newBalance = oldBalance - paymentData.amount;
        
        console.log('💰 Updating balance:', { 
          customer_id: paymentData.customer_id,
          old: oldBalance, 
          payment: paymentData.amount,
          new: newBalance 
        });

        const { error: updateError } = await supabase
          .from('customers')
          .update({ balance: newBalance })
          .eq('id', paymentData.customer_id);

        if (updateError) {
          console.error('⚠️ Balance update error:', updateError);
          return NextResponse.json({ 
            success: true, 
            payment,
            warning: 'Payment recorded but balance not updated: ' + updateError.message
          });
        }

        console.log('✅ Balance updated successfully');
      }
    } catch (balanceError: any) {
      console.error('⚠️ Balance update exception:', balanceError);
      return NextResponse.json({ 
        success: true, 
        payment,
        warning: 'Payment recorded but balance update failed'
      });
    }

    return NextResponse.json({ 
      success: true, 
      payment,
      message: 'Payment recorded and balance updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Payment recording exception:', {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}