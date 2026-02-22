import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

export async function GET(
  request: Request,
  context: { params: Promise<{ routeNumber: string }> }
) {
  try {
    const { routeNumber } = await context.params;
    const { searchParams } = new URL(request.url);
    const deliveryDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const supabase = await createClient();

    // Get route info
    const { data: route } = await supabase
      .from('routes')
      .select('*')
      .eq('route_number', routeNumber)
      .single();

    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Get customers on this route with orders for this date
    const { data: customers } = await supabase
      .from('customers')
      .select(`
        id,
        business_name,
        contact_name,
        address,
        phone,
        drop_number,
        orders!inner(
          id,
          total_amount,
          order_items(
            id,
            quantity,
            product_name
          )
        )
      `)
      .eq('route_number', routeNumber)
      .eq('orders.delivery_date', deliveryDate)
      .order('drop_number', { ascending: true });

    // ✅ Generate PDF - Store chunks outside Promise
    const chunks: any[] = [];
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // Collect PDF data
    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('Condensed Run Sheet', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Route: ${route.route_name || route.route_number}`, { align: 'center' });
    doc.text(`Driver: ${route.driver_name || '—'}`, { align: 'center' });
    doc.text(`Date: ${new Date(deliveryDate).toLocaleDateString('en-AU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`, { align: 'center' });
    doc.moveDown(1);

    // Table Header
    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    
    doc.text('Drop', 40, tableTop);
    doc.text('Customer', 80, tableTop);
    doc.text('Address', 250, tableTop);
    doc.text('Items', 450, tableTop);
    doc.text('Total', 500, tableTop);

    doc.moveTo(40, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(9);

    // Customer rows
    if (!customers || customers.length === 0) {
      doc.text('No deliveries for this route on this date', 40, y);
    } else {
      customers.forEach((customer: any) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const totalItems = customer.orders[0]?.order_items?.reduce(
          (sum: number, item: any) => sum + item.quantity, 
          0
        ) || 0;

        const totalAmount = customer.orders[0]?.total_amount || 0;

        // Drop number
        doc.text(customer.drop_number?.toString() || '—', 40, y);
        
        // Customer name
        doc.text(customer.business_name || customer.contact_name || '—', 80, y, { width: 160 });
        
        // Address
        doc.text(customer.address || '—', 250, y, { width: 190 });
        
        // Items count
        doc.text(`${totalItems} items`, 450, y);
        
        // Total
        doc.text(`$${totalAmount.toFixed(2)}`, 500, y);

        y += 20;
      });
    }

    // Footer
    doc.fontSize(8).text(
      `Generated: ${new Date().toLocaleString('en-AU')}`,
      40,
      750,
      { align: 'center' }
    );

    // End the document
    doc.end();

    // ✅ Wait for PDF to finish
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    // ✅ Create buffer from chunks
    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="condensed-run-sheet-${routeNumber}-${deliveryDate}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('❌ Condensed sheet error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}