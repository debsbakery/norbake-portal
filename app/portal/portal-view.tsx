'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Calendar,
  DollarSign,
  FileText,
  Bell,
  LogOut,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RefreshCw,
  Edit,
  Lock,
} from 'lucide-react';

interface PortalData {
  customer: {
    id: string;
    business_name: string;
    contact_name: string;
    email: string;
    phone: string;
    address: string;
    payment_terms: number;
    credit_limit: number | null;
    balance: number;
  };
  standingOrders: any[];
  recentOrders: any[];
  arBalance: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
    total_due: number;
  };
  invoices: any[];
  notifications: any[];
}

export default function CustomerPortalView({ data }: { data: PortalData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'standing' | 'orders' | 'invoices' | 'account'>('overview');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute for countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const totalOverdue = 
    data.arBalance.days_1_30 +
    data.arBalance.days_31_60 +
    data.arBalance.days_61_90 +
    data.arBalance.days_over_90;

  // Check if order can be edited
  function canEditOrder(order: any): boolean {
    if (order.status !== 'pending') return false;
    const cutoffTime = order.cutoff_time || '17:00:00';
    const cutoffDateTime = new Date(`${order.delivery_date}T${cutoffTime}`);
    return currentTime < cutoffDateTime;
  }

  // Get time until cutoff
  function getTimeUntilCutoff(order: any): string {
    const cutoffTime = order.cutoff_time || '17:00:00';
    const cutoffDateTime = new Date(`${order.delivery_date}T${cutoffTime}`);
    const diff = cutoffDateTime.getTime() - currentTime.getTime();

    if (diff < 0) return 'Editing closed';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} left`;
    }

    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes} min left`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#006A4E" }}>
                Customer Portal
              </h1>
              <p className="text-sm text-gray-600">{data.customer.business_name}</p>
            </div>

            <div className="flex gap-3">
              {data.notifications.length > 0 && (
                <button className="relative p-2 rounded-full hover:bg-gray-100">
                  <Bell className="h-5 w-5 text-gray-600" />
                  <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                    {data.notifications.length}
                  </span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-4 mt-4 border-b overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'standing', label: `Standing Orders (${data.standingOrders.length})` },
              { id: 'orders', label: 'Recent Orders' },
              { id: 'invoices', label: `Invoices (${data.invoices.length})` },
              { id: 'account', label: 'Account' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'overview' && (
          <OverviewTab data={data} formatCurrency={formatCurrency} formatDate={formatDate} totalOverdue={totalOverdue} />
        )}
        {activeTab === 'standing' && (
          <StandingOrdersTab orders={data.standingOrders} formatCurrency={formatCurrency} formatDate={formatDate} />
        )}
        {activeTab === 'orders' && (
          <RecentOrdersTab 
            orders={data.recentOrders} 
            formatCurrency={formatCurrency} 
            formatDate={formatDate}
            canEditOrder={canEditOrder}
            getTimeUntilCutoff={getTimeUntilCutoff}
            router={router}
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab invoices={data.invoices} formatCurrency={formatCurrency} formatDate={formatDate} />
        )}
        {activeTab === 'account' && (
          <AccountTab customer={data.customer} arBalance={data.arBalance} formatCurrency={formatCurrency} totalOverdue={totalOverdue} />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════
// Overview Tab
// ═══════════════════════════════════════════
function OverviewTab({ 
  data, 
  formatCurrency, 
  formatDate,
  totalOverdue 
}: { 
  data: PortalData; 
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
  totalOverdue: number;
}) {
  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/catalog">
          <button className="w-full px-6 py-4 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
            style={{ backgroundColor: '#006A4E' }}>
            <span className="text-2xl">🛒</span>
            <span>Browse Products & Place Order</span>
          </button>
        </a>
        
        <a href="/order/shadow">
          <button className="w-full px-6 py-4 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition flex items-center justify-center gap-2">
            <span className="text-2xl">⭐</span>
            <span>My Usual Items (Quick Order)</span>
          </button>
        </a>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Standing Orders</p>
              <p className="text-3xl font-bold mt-1">{data.standingOrders.length}</p>
              <p className="text-xs text-gray-500 mt-1">Active</p>
            </div>
            <Package className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: data.customer.balance > 0 ? "#CE1126" : "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Account Balance</p>
              <p className="text-3xl font-bold mt-1" style={{ color: data.customer.balance > 0 ? "#CE1126" : "#006A4E" }}>
                {formatCurrency(data.customer.balance)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{data.customer.payment_terms} day terms</p>
            </div>
            <DollarSign className={`h-8 w-8 ${data.customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: totalOverdue > 0 ? "#CE1126" : "#FFD700" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Overdue Amount</p>
              <p className="text-3xl font-bold mt-1" style={{ color: totalOverdue > 0 ? "#CE1126" : "#006A4E" }}>
                {formatCurrency(totalOverdue)}
              </p>
              {totalOverdue > 0 && (
                <p className="text-xs text-red-600 mt-1">⚠️ Payment required</p>
              )}
            </div>
            <AlertCircle className={`h-8 w-8 ${totalOverdue > 0 ? 'text-red-600' : 'text-yellow-600'}`} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Recent Orders</p>
              <p className="text-3xl font-bold mt-1">{data.recentOrders.length}</p>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Rest of your existing Overview tab code... */}
    </div>
  );
}

// Keep your existing StandingOrdersTab function...

// ═══════════════════════════════════════════
// Recent Orders Tab (UPDATED WITH EDIT BUTTON)
// ═══════════════════════════════════════════
function RecentOrdersTab({ 
  orders, 
  formatCurrency, 
  formatDate,
  canEditOrder,
  getTimeUntilCutoff,
  router
}: { 
  orders: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
  canEditOrder: (order: any) => boolean;
  getTimeUntilCutoff: (order: any) => string;
  router: any;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Recent Orders (Last 30 Days)</h2>
      
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No recent orders</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            const isEditable = canEditOrder(order);
            const timeRemaining = getTimeUntilCutoff(order);
            
            return (
              <div key={order.id} className="border rounded-lg overflow-hidden">
                <div className="p-4 flex justify-between items-start bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Delivery: {formatDate(order.delivery_date)}
                    </p>
                    
                    {/* Editing Status */}
                    {order.status === 'pending' && (
                      <div className="mt-2">
                        {isEditable ? (
                          <div className="flex items-center gap-2 text-sm text-orange-600">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">{timeRemaining} to edit</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Lock className="h-4 w-4" />
                            <span>Editing closed</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold" style={{ color: "#006A4E" }}>
                      {formatCurrency(order.total_amount)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {order.order_items?.length || 0} items
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-3">
                      {isEditable && (
                        <button
                          onClick={() => router.push(`/portal/orders/${order.id}/edit`)}
                          className="flex items-center gap-1 px-3 py-1.5 text-white rounded text-sm font-medium"
                          style={{ backgroundColor: '#006A4E' }}
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="px-3 py-1.5 border rounded text-sm"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && order.order_items && (
                  <div className="border-t p-4">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50">
                        <tr className="text-left">
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3 text-center">Quantity</th>
                          <th className="py-2 px-3 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-3">{item.product_name}</td>
                            <td className="py-2 px-3 text-center">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(item.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Keep your existing InvoicesTab and AccountTab functions...
// (They're fine as-is)

function StandingOrdersTab({ 
  orders, 
  formatCurrency, 
  formatDate 
}: { 
  orders: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  // Keep your existing implementation
  return <div>Standing Orders implementation from your code...</div>;
}

function InvoicesTab({ 
  invoices, 
  formatCurrency, 
  formatDate 
}: { 
  invoices: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  // Keep your existing implementation
  return <div>Invoices implementation from your code...</div>;
}

function AccountTab({ 
  customer, 
  arBalance, 
  formatCurrency,
  totalOverdue 
}: { 
  customer: any;
  arBalance: any;
  formatCurrency: (n: number) => string;
  totalOverdue: number;
}) {
  // Keep your existing implementation
  return <div>Account implementation from your code...</div>;
}