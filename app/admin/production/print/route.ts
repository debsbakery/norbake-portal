// app/admin/production/print/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@/lib/supabase/server";

async function checkAdmin() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const adminEmails = ['debs_bakery@outlook.com', 'admin@allstarsbakery.com'];
    return adminEmails.includes(user.email?.toLowerCase() || '');
  } catch {
    return false;
  }
}

// ── Fetch and aggregate ALL dates into one product list ───────────────────────
async function getCombinedForecast(dates: string[], supabase: any) {
  const products: Record<string, any> = {};
  let totalOrders = 0;
  let totalConfirmed = 0;
  let totalProjected = 0;

  for (const date of dates) {
    // ── Orders for this date ─────────────────────────────────────────────────
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, delivery_date, source, customer_id,
        items:order_items(
          product_id, product_name, quantity,
          product:products(code, name, unit, category)
        )
      `)
      .eq('delivery_date', date)
      .in('status', ['pending', 'confirmed', 'in_production']);

    // ── Fix: use AEST date string directly — no Date() parsing ───────────────
    const dayOfWeek = new Date(date + 'T12:00:00+10:00')
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();

    const { data: standingOrders } = await supabase
      .from('standing_orders')
      .select(`
        customer_id,
        items:standing_order_items(
          product_id, quantity,
          product:products(code, name, unit, category)
        )
      `)
      .eq('delivery_day', dayOfWeek)
      .eq('active', true);

    const customerIdsWithOrders = new Set<string>();

    if (orders) {
      orders.forEach((order: any) => {
        customerIdsWithOrders.add(order.customer_id);
        totalConfirmed++;
        totalOrders++;
        if (order.items) {
          order.items.forEach((item: any) => {
            const key = item.product_id;
            if (!products[key]) {
              products[key] = {
                code:         item.product?.code || 0,
                product_name: item.product?.name || item.product_name,
                unit:         item.product?.unit || 'unit',
                category:     item.product?.category || '',
                quantity:     0,
                sources: { manual: 0, standing_order_confirmed: 0, standing_order_projected: 0, online: 0 },
              };
            }
            products[key].quantity += item.quantity;
            if (order.source === 'standing_order')
              products[key].sources.standing_order_confirmed += item.quantity;
            else if (order.source === 'online')
              products[key].sources.online += item.quantity;
            else
              products[key].sources.manual += item.quantity;
          });
        }
      });
    }

    if (standingOrders) {
      standingOrders.forEach((so: any) => {
        if (!customerIdsWithOrders.has(so.customer_id)) {
          totalProjected++;
          totalOrders++;
          if (so.items) {
            so.items.forEach((item: any) => {
              const key = item.product_id;
              if (!products[key]) {
                products[key] = {
                  code:         item.product?.code || 0,
                  product_name: item.product?.name || 'Unknown',
                  unit:         item.product?.unit || 'unit',
                  category:     item.product?.category || '',
                  quantity:     0,
                  sources: { manual: 0, standing_order_confirmed: 0, standing_order_projected: 0, online: 0 },
                };
              }
              products[key].quantity += item.quantity;
              products[key].sources.standing_order_projected += item.quantity;
            });
          }
        }
      });
    }
  }

  const productsArray = Object.values(products)
    .sort((a: any, b: any) => Number(a.code) - Number(b.code));

  const grandTotal = productsArray.reduce((sum, p: any) => sum + p.quantity, 0);

  return { products: productsArray, grandTotal, totalOrders, totalConfirmed, totalProjected };
}

// ── Main GET handler ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const autoPrint = searchParams.get('autoprint') === '1';

  // ── Parse dates — default to today ────────────────────────────────────────
  const datesParam = searchParams.get('dates');
  const dateParam  = searchParams.get('date');

  // ── Fix: default to TODAY not tomorrow ────────────────────────────────────
  const todayAEST = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' })
  ).toISOString().split('T')[0];

  const dates: string[] = datesParam
    ? datesParam.split(',').map(d => d.trim()).filter(Boolean)
    : dateParam
    ? [dateParam]
    : [todayAEST];

  const rangeStart = dates[0] ?? todayAEST;
  const rangeEnd   = dates[dates.length - 1] ?? todayAEST;

  // ── Service client ─────────────────────────────────────────────────────────
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Get combined totals ────────────────────────────────────────────────────
  const { products, grandTotal, totalOrders, totalConfirmed, totalProjected }
    = await getCombinedForecast(dates, supabase);

  // ── Page title ────────────────────────────────────────────────────────────
  const fmt = (d: string) => new Date(d + 'T12:00:00+10:00')
    .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  const pageTitle = dates.length === 1
    ? new Date(dates[0] + 'T12:00:00+10:00').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    : `${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Production Sheet - ${pageTitle}</title>
  <style>
    @media print {
      @page { margin: 0.5in; }
      .no-print { display: none !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; padding: 20px; }

    .controls {
      padding: 16px 20px; background: #f5f5f5;
      margin-bottom: 24px; border-radius: 8px; border: 1px solid #ddd;
    }
    .controls h3 { margin-bottom: 12px; font-size: 13pt; color: #333; }
    .range-row {
      display: flex; align-items: flex-end;
      gap: 12px; flex-wrap: wrap; margin-bottom: 14px;
    }
    .range-row label {
      display: flex; flex-direction: column;
      gap: 4px; font-size: 10pt; font-weight: bold; color: #444;
    }
    .range-row input[type="date"] {
      padding: 7px 10px; border: 1px solid #ccc;
      border-radius: 5px; font-size: 11pt;
    }
    .preset-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .preset-btn {
      padding: 5px 10px; font-size: 9pt;
      border: 1px solid #ccc; border-radius: 4px;
      background: white; cursor: pointer;
    }
    .preset-btn:hover { background: #e8f5e9; border-color: #006A4E; }
    .action-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      padding: 8px 18px; border: none; border-radius: 5px;
      cursor: pointer; font-weight: bold; font-size: 11pt;
      text-decoration: none; display: inline-block;
    }
    .btn-view  { background: white; color: #006A4E; border: 2px solid #006A4E; }
    .btn-print { background: #CE1126; color: white; }
    .btn-back  { background: #666; color: white; }

    .page-header {
      margin-bottom: 20px; padding-bottom: 14px;
      border-bottom: 3px solid #006A4E;
    }
    .page-header h1 { color: #006A4E; font-size: 22pt; margin-bottom: 4px; }
    .page-header .subtitle { font-size: 15pt; font-weight: bold; margin-bottom: 4px; }
    .page-header .summary  { font-size: 10pt; color: #444; }

    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 8px; }
    th {
      background: #006A4E; color: white;
      font-weight: bold; text-transform: uppercase; font-size: 9pt;
    }
    tr:nth-child(even) { background: #f9f9f9; }
    .total-row {
      background: #e6f4ef !important; font-weight: bold;
      border-top: 2px solid #333;
    }

    .signoff {
      margin-top: 30px; border-top: 1px solid #ccc;
      padding-top: 20px; display: flex;
      justify-content: space-between; gap: 20px;
    }
    .signoff div p { margin-bottom: 36px; }

    .empty {
      text-align: center; padding: 60px 20px;
      color: #666; font-size: 14pt;
    }
  </style>
</head>
<body>

  <!-- Controls (hidden on print) -->
  <div class="controls no-print">
    <h3>Production Sheet</h3>
    <div class="range-row">
      <label>
        Start Date
        <input type="date" id="startDate" value="${rangeStart}">
      </label>
      <label>
        End Date
        <input type="date" id="endDate" value="${rangeEnd}">
      </label>
    </div>
    <div class="preset-row">
      <button class="preset-btn" onclick="setPreset(0,0)">Today</button>
      <button class="preset-btn" onclick="setPreset(1,1)">Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(0,1)">Today + Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(1,7)">Next 7 Days</button>
    </div>
    <div class="action-row">
      <button onclick="loadRange(false)" class="btn btn-view">View</button>
      <button onclick="loadRange(true)"  class="btn btn-print">Print</button>
      <a href="/admin/production" class="btn btn-back">Back</a>
    </div>
  </div>

  <!-- Printed header -->
  <div class="page-header">
    <h1>Production Sheet</h1>
    <div class="subtitle">${pageTitle}</div>
    <div class="summary">
      Orders: <strong>${totalOrders}</strong>
      (${totalConfirmed} confirmed${totalProjected > 0 ? `, ${totalProjected} projected` : ''})
      &nbsp;|&nbsp;
      Total items: <strong>${grandTotal}</strong>
      &nbsp;|&nbsp;
      Printed: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
    </div>
  </div>

  <!-- Combined product table -->
  ${products.length === 0 ? `
    <div class="empty">No orders found for the selected period.</div>
  ` : `
    <table>
      <thead>
        <tr>
          <th style="width:70px;">Code</th>
          <th>Product</th>
          <th style="width:100px; text-align:right;">Total Qty</th>
          <th style="width:150px;">Source</th>
          <th style="width:70px; text-align:center;">Done</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((p: any) => `
          <tr>
            <td style="font-family:monospace; font-weight:bold;">${p.code}</td>
            <td>
              <strong>${p.product_name}</strong>
              ${p.category
                ? `<br><span style="font-size:9pt;color:#666;">${p.category}</span>`
                : ''}
            </td>
            <td style="text-align:right; font-size:16pt; font-weight:bold;">
              ${p.quantity}
              <span style="font-size:9pt; font-weight:normal;"> ${p.unit}</span>
            </td>
            <td style="font-size:9pt; line-height:1.8;">
              ${p.sources.manual > 0
                ? `Manual: ${p.sources.manual}<br>` : ''}
              ${p.sources.standing_order_confirmed > 0
                ? `Standing: ${p.sources.standing_order_confirmed}<br>` : ''}
              ${p.sources.standing_order_projected > 0
                ? `Projected: ${p.sources.standing_order_projected}<br>` : ''}
              ${p.sources.online > 0
                ? `Online: ${p.sources.online}` : ''}
            </td>
            <td style="text-align:center;">
              <input type="checkbox" style="width:18px;height:18px;">
            </td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="2" style="text-align:right; font-size:12pt;">GRAND TOTAL:</td>
          <td style="text-align:right; font-size:18pt; font-weight:bold;">${grandTotal}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:40px; border-top:1px solid #ccc; padding-top:20px;">
      <p style="font-weight:bold; margin-bottom:10px;">Production Notes:</p>
      <div style="border:1px solid #ccc; min-height:80px; padding:10px; background:#f9f9f9;"></div>
    </div>
  `}

  <div class="signoff">
    <div>
      <p>Prepared by: _______________________</p>
      <p>Date: _______________________</p>
    </div>
    <div>
      <p>Checked by: _______________________</p>
      <p>Date: _______________________</p>
    </div>
  </div>

  <script>
    ${autoPrint ? `
      window.addEventListener('load', function() {
        setTimeout(function() { window.print(); }, 800);
      });
    ` : ''}

    function getDatesBetween(start, end) {
      const dates = [];
      const current = new Date(start + 'T12:00:00');
      const last    = new Date(end   + 'T12:00:00');
      if (current > last) return [start];
      while (current <= last) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }

    function setPreset(startOffset, endOffset) {
      // ── Use AEST today ─────────────────────────────────────────────────────
      const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
      const s     = new Date(now); s.setDate(s.getDate() + startOffset);
      const e     = new Date(now); e.setDate(e.getDate() + endOffset);
      const toISO = d => d.toISOString().split('T')[0];
      document.getElementById('startDate').value = toISO(s);
      document.getElementById('endDate').value   = toISO(e);
    }

    function loadRange(print) {
      const start = document.getElementById('startDate').value;
      const end   = document.getElementById('endDate').value;
      if (!start || !end) { alert('Please select both dates.'); return; }
      if (start > end)    { alert('Start must be before end date.'); return; }
      const dates = getDatesBetween(start, end);
      if (dates.length > 14) {
        if (!confirm('You have ' + dates.length + ' days selected. Continue?')) return;
      }
      const params = new URLSearchParams({ dates: dates.join(',') });
      if (print) params.set('autoprint', '1');
      window.location.href = '/admin/production/print?' + params.toString();
    }

    document.getElementById('startDate').addEventListener('change', function() {
      const end = document.getElementById('endDate');
      if (this.value > end.value) end.value = this.value;
    });

    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}