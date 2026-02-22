'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Calendar, Package } from 'lucide-react';

export default function RepeatOrderView({ customer, recentOrders }: any) {
  const router = useRouter();
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [newDeliveryDate, setNewDeliveryDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [creating, setCreating] = useState(false);

  const selectedOrder = recentOrders.find((o: any) => o.id === selectedOrderId);

  async function handleRepeatOrder() {
    if (!selectedOrderId || !newDeliveryDate) {
      alert('⚠️ Please select an order and delivery date');
      return;
    }

    setCreating(true);

    try {
      const response = await fetch('/api/admin/orders/repeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_order_id: selectedOrderId,
          new_delivery_date: newDeliveryDate,
        }),
      });

      if (response.ok) {
        const { new_order_id } = await response.json();
        alert('✅ Order created! Redirecting to edit...');
        router.push(`/admin/orders/${new_order_id}/edit`);
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Error creating order');
      console.error(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Copy className="h-6 w-6 text-blue-600" />
          Repeat Order for {customer.business_name || customer.contact_name}
        </h1>

        <div className="space-y-6">
          {/* Step 1: Select Previous Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Step 1: Select Order to Repeat
            </label>
            
            {recentOrders.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent orders found for this customer</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentOrders.map((order: any) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full text-left border rounded-lg p-4 hover:border-blue-500 transition-all ${
                      selectedOrderId === order.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {new Date(order.delivery_date).toLocaleDateString('en-AU', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {order.order_items.length} items • ${order.total_amount?.toFixed(2)}
                        </p>
                      </div>
                      {selectedOrderId === order.id && (
                        <span className="text-blue-600 font-semibold">✓ Selected</span>
                      )}
                    </div>

                    {/* Show items preview */}
                    <div className="mt-2 text-xs text-gray-500">
                      {order.order_items.slice(0, 3).map((item: any, idx: number) => (
                        <span key={idx}>
                          {item.quantity}× {item.product_name}
                          {idx < Math.min(2, order.order_items.length - 1) ? ', ' : ''}
                        </span>
                      ))}
                      {order.order_items.length > 3 && ` +${order.order_items.length - 3} more`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Preview Selected Order */}
          {selectedOrder && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Items to be Copied:
              </h3>
              <div className="space-y-2">
                {selectedOrder.order_items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>
                      {item.quantity}× {item.product_name}
                    </span>
                    <span className="font-medium">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total:</span>
                  <span className="text-blue-600">${selectedOrder.total_amount?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Select New Delivery Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Step 2: Select New Delivery Date
            </label>
            <input
              type="date"
              value={newDeliveryDate}
              onChange={(e) => setNewDeliveryDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleRepeatOrder}
              disabled={creating || !selectedOrderId || !newDeliveryDate}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300"
            >
              <Copy className="h-4 w-4" />
              {creating ? 'Creating Order...' : 'Create Order (Can Edit After)'}
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3">
            ℹ️ <strong>Note:</strong> After creating the order, you'll be redirected to the edit page where you can adjust quantities, add/remove items, and change the delivery date if needed.
          </p>
        </div>
      </div>
    </div>
  );
}