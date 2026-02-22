'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, DollarSign, Search } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
];

export default function RecordPaymentView({ customers }: any) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    customer_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCustomers = customers.filter((c: any) =>
    (c.business_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (c.contact_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const selectedCustomer = customers.find((c: any) => c.id === formData.customer_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.customer_id || !formData.amount || parseFloat(formData.amount) <= 0) {
      alert('⚠️ Please select a customer and enter a valid amount');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
        }),
      });

      if (response.ok) {
        alert('✅ Payment recorded successfully!');
        router.push('/admin/ar');
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Error recording payment');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-green-600" />
          Record Payment
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <select
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select a customer</option>
              {filteredCustomers.map((customer: any) => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name || customer.contact_name} - Balance: $
                  {customer.balance.toFixed(2)}
                </option>
              ))}
            </select>

            {selectedCustomer && (
              <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Current Balance:</strong> ${selectedCustomer.balance.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Date *
            </label>
            <input
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method *
            </label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference Number (Check #, Transaction ID, etc.)
            </label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="Optional"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes about this payment"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}