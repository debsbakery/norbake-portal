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

// ── Fetch forecast data for ONE date ──────────────────────────────────────────
async function getForecastData(date: string, supabase: any) {
  try {
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

    const dayOfWeek = new Date(`${date}T00:00:00`)
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

    const products: Record<string, any> = {};
    const customerIdsWithOrders = new Set<string>();
    let confirmedOrders = 0;
    let standingOrderProjections = 0;

    if (orders) {
      orders.forEach((order: any) => {
        customerIdsWithOrders.add(order.customer_id);
        confirmedOrders++;
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
                sources: {
                  manual:                   0,
                  standing_order_confirmed: 0,
                  standing_order_projected: 0,
                  online:                   0,
                },
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
          standingOrderProjections++;
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
                  sources: {
                    manual:                   0,
                    standing_order_confirmed: 0,
                    standing_order_projected: 0,
                    online:                   0,
                  },
                };
              }
              products[key].quantity += item.quantity;
              products[key].sources.standing_order_projected += item.quantity;
            });
          }
        }
      });
    }

    const productsArray = Object.values(products)
      .sort((a: any, b: any) => Number(a.code) - Number(b.code));

    const totalItems = productsArray.reduce((sum, p: any) => sum + p.quantity, 0);

    return {
      date,
      products:                 productsArray,
      totalOrders:              confirmedOrders + standingOrderProjections,
      confirmedOrders,
      standingOrderProjections,
      totalItems,
    };
  } catch (error) {
    console.error('Error fetching forecast:', error);
    return null;
  }
}

// ── Render one day section ─────────────────────────────────────────────────────
function renderDaySection(data: any) {
  const printDate = new Date(`${data.date}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (!data.products.length) {
    return `
      <div class="day-section">
        <div class="day-header">
          <h2>${printDate}</h2>
          <div class="day-stats"><span>No orders</span></div>
        </div>
        <p style="padding:20px;color:#666;text-align:center;">
          No orders found for this date.
        </p>
      </div>`;
  }

  return `
    <div class="day-section">
      <div class="day-header">
        <h2>${printDate}</h2>
        <div class="day-stats">
          <span>Orders: <strong>${data.totalOrders}</strong>
            (${data.confirmedOrders} confirmed${data.standingOrderProjections > 0
              ? `, ${data.standingOrderProjections} standing` : ''})</span>
          <span>Total Items: <strong>${data.totalItems}</strong></span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:70px;">Code</th>
            <th>Product</th>
            <th style="width:90px;text-align:right;">Qty</th>
            <th style="width:140px;">Source</th>
            <th style="width:70px;text-align:center;">Done</th>
          </tr>
        </thead>
        <tbody>
          ${data.products.map((p: any) => `
            <tr>
              <td style="font-family:monospace;font-weight:bold;">${p.code}</td>
              <td>
                <strong>${p.product_name}</strong>
                ${p.category
                  ? `<br><span style="font-size:9pt;color:#666;">${p.category}</span>`
                  : ''}
              </td>
              <td style="text-align:right;font-size:14pt;">
                <strong>${p.quantity}</strong>
                <span style="font-size:9pt;"> ${p.unit}</span>
              </td>
              <td style="font-size:9pt;line-height:1.8;">
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
            <td colspan="2" style="text-align:right;font-size:11pt;">DAY TOTAL:</td>
            <td style="text-align:right;font-size:15pt;"><strong>${data.totalItems}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

// ── Main GET handler ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);

  // ── autoprint flag — set by Print button in launcher ──────────────────────
  const autoPrint = searchParams.get('autoprint') === '1';

  // ── Support ?dates=d1,d2 and legacy ?date=d1 ──────────────────────────────
  const datesParam = searchParams.get('dates');
  const dateParam  = searchParams.get('date');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];

  const dates: string[] = datesParam
    ? datesParam.split(',').map(d => d.trim()).filter(Boolean)
    : dateParam
    ? [dateParam]
    : [defaultDate];

  // ── First and last date for the range inputs ───────────────────────────────
  const rangeStart = dates[0] ?? defaultDate;
  const rangeEnd   = dates[dates.length - 1] ?? defaultDate;

  // ── Service client ─────────────────────────────────────────────────────────
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Fetch all dates in parallel ────────────────────────────────────────────
  const allData = await Promise.all(
    dates.map(date => getForecastData(date, supabase))
  );

  const validData   = allData.filter(Boolean) as any[];
  const grandTotal  = validData.reduce((sum, d) => sum + d.totalItems, 0);
  const grandOrders = validData.reduce((sum, d) => sum + d.totalOrders, 0);

  const dateLabels = dates.map(d =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  );
  const pageTitle = dateLabels.length === 1
    ? dateLabels[0]
    : `${dateLabels[0]} to ${dateLabels[dateLabels.length - 1]}`;

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
      .day-section { page-break-after: always; }
      .day-section:last-of-type { page-break-after: avoid; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; padding: 20px; }

    /* ── Controls ── */
    .controls {
      padding: 16px 20px;
      background: #f5f5f5;
      margin-bottom: 24px;
      border-radius: 8px;
      border: 1px solid #ddd;
    }
    .controls h3 { margin-bottom: 12px; font-size: 13pt; color: #333; }
    .range-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .range-row label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10pt;
      font-weight: bold;
      color: #444;
    }
    .range-row input[type="date"] {
      padding: 7px 10px;
      border: 1px solid #ccc;
      border-radius: 5px;
      font-size: 11pt;
    }
    .preset-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .preset-btn {
      padding: 5px 10px;
      font-size: 9pt;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: white;
      cursor: pointer;
    }
    .preset-btn:hover { background: #e8f5e9; border-color: #006A4E; }
    .action-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      padding: 8px 18px; border: none; border-radius: 5px;
      cursor: pointer; font-weight: bold; font-size: 11pt;
      text-decoration: none; display: inline-block;
    }
    .btn-view    { background: white; color: #006A4E;
                   border: 2px solid #006A4E; }
    .btn-print   { background: #CE1126; color: white; }
    .btn-back    { background: #666; color: white; }

    /* ── Page header ── */
    .page-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 3px solid #006A4E;
    }
    .page-header h1 { color: #006A4E; font-size: 22pt; margin-bottom: 4px; }
    .page-header .subtitle { font-size: 16pt; font-weight: bold; margin-bottom: 4px; }
    .page-header .summary  { font-size: 10pt; color: #444; }

    /* ── Day sections ── */
    .day-section { margin-bottom: 36px; }
    .day-header {
      background: #006A4E;
      color: white;
      padding: 10px 14px;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .day-header h2 { font-size: 14pt; }
    .day-stats { font-size: 10pt; opacity: 0.9; display: flex; gap: 16px; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; margin-top: 0; }
    th, td { border: 1px solid #333; padding: 8px; }
    th {
      background: #004d38; color: white;
      font-weight: bold; text-transform: uppercase; font-size: 9pt;
    }
    tr:nth-child(even) { background: #f9f9f9; }
    .total-row { background: #e6f4ef !important; font-weight: bold; border-top: 2px solid #333; }

    /* ── Grand total ── */
    .grand-total {
      margin-top: 30px; padding: 16px 20px;
      background: #006A4E; color: white; border-radius: 8px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .grand-total span { font-size: 14pt; font-weight: bold; }

    /* ── Sign-off ── */
    .signoff {
      margin-top: 30px; border-top: 1px solid #ccc;
      padding-top: 20px; display: flex;
      justify-content: space-between; gap: 20px;
    }
    .signoff div p { margin-bottom: 36px; }
  </style>
</head>
<body>

  <!-- ── Controls (hidden on print) ── -->
  <div class="controls no-print">
    <h3>Production Sheet</h3>

    <!-- Date range inputs -->
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

    <!-- Quick presets -->
    <div class="preset-row">
      <button class="preset-btn" onclick="setPreset(0,0)">Today</button>
      <button class="preset-btn" onclick="setPreset(1,1)">Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(0,1)">Today + Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(1,7)">Next 7 Days</button>
    </div>

    <!-- Action buttons -->
    <div class="action-row">
      <button onclick="loadRange(false)" class="btn btn-view">View</button>
      <button onclick="loadRange(true)"  class="btn btn-print">Print</button>
      <a href="/admin/production" class="btn btn-back">Back</a>
    </div>
  </div>

  <!-- ── Printed page header ── -->
  <div class="page-header">
    <h1>Production Sheet</h1>
    <div class="subtitle">${pageTitle}</div>
    <div class="summary">
      Total orders: <strong>${grandOrders}</strong> &nbsp;|&nbsp;
      Total items: <strong>${grandTotal}</strong> &nbsp;|&nbsp;
      Printed: ${new Date().toLocaleString('en-AU')}
    </div>
  </div>

  <!-- ── Day sections ── -->
  ${validData.map(renderDaySection).join('')}

  <!-- ── Grand total (multi-day only) ── -->
  ${dates.length > 1 ? `
    <div class="grand-total">
      <span>GRAND TOTAL — ALL DAYS</span>
      <span>${grandTotal} items &nbsp;|&nbsp; ${grandOrders} orders</span>
    </div>
  ` : ''}

  <!-- ── Sign-off ── -->
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
    // ── Auto-print if flag set ─────────────────────────────────────────────
    ${autoPrint ? `
      window.addEventListener('load', function() {
        setTimeout(function() { window.print(); }, 800);
      });
    ` : ''}

    // ── Build date list from start to end ─────────────────────────────────
    function getDatesBetween(start, end) {
      const dates = [];
      const current = new Date(start + 'T00:00:00');
      const last    = new Date(end   + 'T00:00:00');
      if (current > last) return [start];
      while (current <= last) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }

    // ── Quick presets (startOffset, endOffset from today) ─────────────────
    function setPreset(startOffset, endOffset) {
      const s = new Date(); s.setDate(s.getDate() + startOffset);
      const e = new Date(); e.setDate(e.getDate() + endOffset);
      document.getElementById('startDate').value = s.toISOString().split('T')[0];
      document.getElementById('endDate').value   = e.toISOString().split('T')[0];
    }

    // ── Load selected range ────────────────────────────────────────────────
    function loadRange(print) {
      const start = document.getElementById('startDate').value;
      const end   = document.getElementById('endDate').value;
      if (!start || !end) { alert('Please select both dates.'); return; }
      if (start > end) { alert('Start date must be before end date.'); return; }
      const dates = getDatesBetween(start, end);
      if (dates.length > 14) {
        if (!confirm('You have selected ' + dates.length + ' days. Continue?')) return;
      }
      const params = new URLSearchParams({ dates: dates.join(',') });
      if (print) params.set('autoprint', '1');
      window.location.href = '/admin/production/print?' + params.toString();
    }

    // ── Guard: end date never before start ────────────────────────────────
    document.getElementById('startDate').addEventListener('change', function() {
      const end = document.getElementById('endDate');
      if (this.value > end.value) end.value = this.value;
    });

    // ── Ctrl+P shortcut ───────────────────────────────────────────────────
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