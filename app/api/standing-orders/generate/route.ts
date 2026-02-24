export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email-sender';

// ✅ Helper to create service client
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function POST() {
  try {
    const supabase = createServiceClient();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`\n🔄 [${new Date().toISOString()}] Starting weekly standing order generation...`);
    console.log(`📅 Generating orders for the week of ${todayStr}`);

    // ✅ Get ALL active standing orders (not filtered by next_generation_date)
    const { data: standingOrders, error: fetchError } = await supabase
      .from('standing_orders')
      .select(`
        *,
        customer:customers(*),
        items:standing_order_items(
          *,
          product:products(*)
        )
      `)
      .eq('active', true);

    if (fetchError) throw fetchError;

    if (!standingOrders || standingOrders.length === 0) {
      console.log('⚠️ No active standing orders found');
      return NextResponse.json({ 
        message: 'No active standing orders',
        ordersCreated: 0 
      });
    }

    console.log(`✅ Found ${standingOrders.length} active standing orders`);

    let ordersCreated = 0;
    const errors: any[] = [];
    const ordersSummary: any[] = [];

    // ✅ Generate orders for the next 7 days
    for (const standingOrder of standingOrders) {
      try {
        const deliveryDay = (standingOrder.delivery_days || standingOrder.delivery_day || '').toLowerCase();
        
        if (!deliveryDay) {
          console.warn(`⚠️ Standing order ${standingOrder.id} has no delivery day set`);
          continue;
        }

        // ✅ Calculate next delivery date based on delivery day
        const deliveryDate = getNextDeliveryDate(deliveryDay);
        const deliveryDateStr = deliveryDate.toISOString().split('T')[0];

        console.log(`📦 Processing: ${standingOrder.customer.business_name} → ${deliveryDay} (${deliveryDateStr})`);

        // ✅ Check if order already exists for this delivery date
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_id', standingOrder.customer_id)
          .eq('delivery_date', deliveryDateStr)
          .maybeSingle();

        if (existingOrder) {
          console.log(`  ⏭️ Order already exists for ${deliveryDateStr}`);
          continue;
        }

        // ✅ Get customer pricing for accurate totals
        const itemsWithPricing = await Promise.all(
          standingOrder.items.map(async (item: any) => {
            const { data: pricing } = await supabase
              .from('customer_pricing')
              .select('contract_price')
              .eq('customer_id', standingOrder.customer_id)
              .eq('product_id', item.product_id)
              .lte('effective_from', deliveryDateStr)
              .or(`effective_to.is.null,effective_to.gte.${deliveryDateStr}`)
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle();

            const unitPrice = pricing?.contract_price || item.product.price || item.product.unit_price;
            const subtotal = unitPrice * item.quantity;

            return {
              product_id: item.product_id,
              product_name: item.product.name,
              quantity: item.quantity,
              unit_price: unitPrice,
              subtotal,
              gst_applicable: item.product.gst_applicable || false
            };
          })
        );

        // ✅ Calculate totals
        const totalBeforeGST = itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0);
        const gstAmount = itemsWithPricing
          .filter(item => item.gst_applicable)
          .reduce((sum, item) => sum + (item.subtotal * 0.1), 0);
        const totalAmount = totalBeforeGST + gstAmount;

        // ✅ CREATE ORDER with PENDING status
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: standingOrder.customer_id,
            customer_email: standingOrder.customer.email,
            customer_business_name: standingOrder.customer.business_name,
            customer_address: standingOrder.customer.address,
            customer_abn: standingOrder.customer.abn,
            delivery_date: deliveryDateStr,
            total_amount: totalAmount,
            status: 'pending',
            source: 'standing_order',
            notes: `Auto-generated from ${deliveryDay} standing order`
          })
          .select()
          .single();

        if (orderError) {
          console.error(`  ❌ Error creating order:`, orderError);
          errors.push({
            standing_order_id: standingOrder.id,
            customer: standingOrder.customer.business_name,
            error: orderError.message
          });
          continue;
        }

        console.log(`  ✅ Created order ${newOrder.id.slice(0, 8)}`);

        // ✅ Create order items
        const orderItems = itemsWithPricing.map(item => ({
          order_id: newOrder.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          gst_applicable: item.gst_applicable
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsError) {
          console.error(`  ❌ Error creating order items:`, itemsError);
          // Rollback: delete the order
          await supabase.from('orders').delete().eq('id', newOrder.id);
          errors.push({
            standing_order_id: standingOrder.id,
            customer: standingOrder.customer.business_name,
            error: itemsError.message
          });
          continue;
        }

        // ✅ Update standing order tracking dates
        const nextDelivery = getNextDeliveryDate(deliveryDay, 7); // Next week's delivery
        const nextGenerationDateStr = nextDelivery.toISOString().split('T')[0];

        await supabase
          .from('standing_orders')
          .update({
            last_generated_date: todayStr,
            next_generation_date: nextGenerationDateStr
          })
          .eq('id', standingOrder.id);

        ordersCreated++;
        
        ordersSummary.push({
          customer: standingOrder.customer.business_name,
          deliveryDay: deliveryDay,
          deliveryDate: deliveryDateStr,
          total: totalAmount,
          orderId: newOrder.id.slice(0, 8)
        });

        console.log(`  ✅ Complete - Delivery: ${deliveryDateStr}, Total: $${totalAmount.toFixed(2)}`);

        // ✅ Send confirmation email
        try {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery-portal.vercel.app';
          
          await sendEmail({
            to: standingOrder.customer.email,
            subject: `Your ${deliveryDay.charAt(0).toUpperCase() + deliveryDay.slice(1)} Standing Order - Deb's Bakery`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #006A4E; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">🥖 Deb's Bakery</h1>
                  <p style="margin: 10px 0 0 0;">Your Standing Order is Confirmed</p>
                </div>
                
                <div style="background: white; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; margin-top: 0;">Hi ${standingOrder.customer.business_name || standingOrder.customer.email}!</p>
                  
                  <p>Your weekly standing order has been automatically placed for this week:</p>
                  
                  <div style="background: #f0fdf4; padding: 15px; border-radius: 5px; border-left: 4px solid #006A4E; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Order #:</strong> ${newOrder.id.slice(0, 8).toUpperCase()}</p>
                    <p style="margin: 5px 0;"><strong>Delivery Day:</strong> ${deliveryDay.charAt(0).toUpperCase() + deliveryDay.slice(1)}</p>
                    <p style="margin: 5px 0;"><strong>Delivery Date:</strong> ${deliveryDate.toLocaleDateString('en-AU', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</p>
                    <p style="margin: 5px 0; font-size: 18px; color: #006A4E;"><strong>Total: $${totalAmount.toFixed(2)}</strong></p>
                  </div>
                  
                  <div style="background: #fffbeb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px;"><strong>📝 Need to make changes?</strong></p>
                    <p style="margin: 10px 0 0 0; font-size: 14px;">You can edit your order before the cutoff time in the <a href="${siteUrl}/portal" style="color: #006A4E; font-weight: bold;">Customer Portal</a></p>
                  </div>
                  
                  <p style="margin-top: 20px; color: #666; font-size: 13px;">
                    To pause or manage your standing orders, visit your <a href="${siteUrl}/portal/standing-orders" style="color: #006A4E;">Standing Orders page</a>.
                  </p>
                </div>
              </div>
            `,
          });
          
          console.log(`  ✅ Confirmation email sent to ${standingOrder.customer.email}`);
        } catch (emailError) {
          console.error('  ⚠️ Email failed:', emailError);
        }

      } catch (error: any) {
        console.error(`  ❌ Error processing standing order ${standingOrder.id}:`, error);
        errors.push({
          standing_order_id: standingOrder.id,
          customer: standingOrder.customer?.business_name || 'Unknown',
          error: error.message
        });
      }
    }

    console.log(`\n✅ Generation complete: ${ordersCreated} orders created`);
    if (ordersSummary.length > 0) {
      console.log('\n📋 Orders Created:');
      ordersSummary.forEach(order => {
        console.log(`  • ${order.customer} - ${order.deliveryDay} (${order.deliveryDate}) - $${order.total.toFixed(2)}`);
      });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully generated ${ordersCreated} standing orders`,
      ordersCreated,
      orders: ordersSummary,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('❌ Error in standing order generation:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate standing orders' },
      { status: 500 }
    );
  }
}

/**
 * ✅ Calculate next delivery date for a given day of the week
 * @param deliveryDay - e.g., "monday", "friday"
 * @param daysAhead - How many days to look ahead (default 7 for next occurrence)
 */
function getNextDeliveryDate(deliveryDay: string, daysAhead: number = 7): Date {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDayIndex = days.indexOf(deliveryDay.toLowerCase());
  
  if (targetDayIndex === -1) {
    // Fallback: return tomorrow if invalid day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  const today = new Date();
  const currentDayIndex = today.getDay();
  
  // Calculate days until next occurrence of target day
  let daysUntilDelivery = targetDayIndex - currentDayIndex;
  
  if (daysUntilDelivery <= 0) {
    // Target day is earlier in week or today, go to next week
    daysUntilDelivery += 7;
  }
  
  // If looking further ahead (e.g., next week's occurrence)
  if (daysAhead > 7) {
    daysUntilDelivery += 7;
  }
  
  const deliveryDate = new Date(today);
  deliveryDate.setDate(today.getDate() + daysUntilDelivery);
  
  return deliveryDate;
}

/**
 * ✅ Manual trigger function for testing
 */
export async function GET() {
  return NextResponse.json({
    message: 'Standing Order Generation Endpoint',
    usage: 'POST to this endpoint to trigger standing order generation',
    schedule: 'Automated: Every Sunday at 6:00 AM',
    manual: 'POST /api/standing-orders/generate'
  });
}