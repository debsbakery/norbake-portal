'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function RepeatOrderSearchPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, business_name, contact_name')
      .order('business_name');

    setCustomers(data || []);
    setLoading(false);
  }

  const filteredCustomers = customers.filter((c) =>
    (c.business_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (c.contact_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Select Customer to Repeat Order</h1>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md"
          />
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading...</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => router.push(`/admin/customers/${customer.id}/repeat-order`)}
                className="w-full text-left border border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-all"
              >
                <p className="font-medium">{customer.business_name || customer.contact_name}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}