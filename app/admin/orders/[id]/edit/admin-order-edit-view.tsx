'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, X, ArrowLeft, Save } from 'lucide-react';

export default function AdminOrderEditView({ order, products }: any) {
  const router = useRouter();
  const [items, setItems] = useState(order.order_items || []);
  const [saving, setSaving] = useState(false);

  // Same logic as customer edit view...
  function calculateTotals() {
    const subtotal = items.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0);
    const gst = items.reduce((sum: number, item: any) => 
      sum + (item.gst_applicable ? item.quantity * item.unit_price * 0.1 : 0), 0);
    return { subtotal, gst, total: subtotal + gst };
  }

  function updateQuantity(itemId: string, newQuantity: number) {
    setItems(items.map((item: any) =>
      item.id === itemId ? { ...item, quantity: Math.max(0, newQuantity) } : item
    ).filter((item: any) => item.quantity > 0));
  }

  function addProduct(productId: string) {
    const product = products.find((p: any) => p.id === productId);
    if (!product) return;

    const existingItem = items.find((item: any) => item.product?.id === productId);
    if (existingItem) {
      updateQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      setItems([...items, {
        id: `new-${Date.now()}`,
        product_id: product.id,
        product_name: product.name,
        product: product,
        quantity: 1,
        unit_price: product.price,
        gst_applicable: product.gst_applicable || false,
      }]);
    }
  }

  async function saveChanges() {
    if (items.length === 0) {
      alert('⚠️ Order must have at least one item');
      return;
    }

    setSaving(true);
    const { total } = calculateTotals();

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item: any) => ({
            product_id: item.product?.id || item.product_id,
            product_name: item.product?.name || item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            gst_applicable: item.gst_applicable,
          })),
          total_amount: total,
        }),
      });

      if (response.ok) {
        alert('✅ Order updated!');
        router.push('/admin');
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Error saving');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  const { subtotal, gst, total } = calculateTotals();

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <h1 className="text-3xl font-bold mb-6">Edit Order #{order.id.slice(0, 8).toUpperCase()}</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Order Items</h2>
          {items.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No items</p>
          ) : (
            <div className="space-y-3">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-4 p-3 border rounded">
                  <div className="flex-1">
                    <p className="font-medium">{item.product?.name || item.product_name}</p>
                    <p className="text-sm text-gray-500">${item.unit_price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-8 h-8 bg-gray-200 rounded">
                      <Minus className="h-4 w-4 mx-auto" />
                    </button>
                    <span className="w-12 text-center font-semibold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-8 h-8 bg-gray-200 rounded">
                      <Plus className="h-4 w-4 mx-auto" />
                    </button>
                  </div>
                  <div className="w-24 text-right">${(item.quantity * item.unit_price).toFixed(2)}</div>
                  <button onClick={() => updateQuantity(item.id, 0)} className="text-red-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 sticky top-6">
          <h2 className="text-lg font-semibold mb-4">Add Products</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
            {products.map((product: any) => (
              <button key={product.id} onClick={() => addProduct(product.id)} className="w-full text-left border p-3 rounded hover:border-green-500">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium text-sm">{product.name}</p>
                    <p className="text-xs text-gray-500">#{product.product_number}</p>
                  </div>
                  <p className="font-semibold">${product.price.toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>GST:</span><span>${gst.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span><span className="text-green-600">${total.toFixed(2)}</span>
            </div>
            <button onClick={saveChanges} disabled={saving || items.length === 0} 
              className="w-full py-3 bg-green-600 text-white rounded font-medium disabled:bg-gray-300 mt-4">
              <Save className="h-4 w-4 inline mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => router.push('/admin')} className="w-full py-2 border rounded">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}