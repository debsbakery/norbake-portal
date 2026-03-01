'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'

interface Props {
  customerId:   string
  customerName: string
  orderCount:   number
}

export default function DeleteCustomerButton({
  customerId,
  customerName,
  orderCount,
}: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const hasOrders = orderCount > 0

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.push('/admin/customers?deleted=1')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete customer')
        setDeleting(false)
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
      setDeleting(false)
    }
  }

  return (
    <>
      {/* ── Delete trigger button ── */}
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-200
                   text-red-600 hover:bg-red-50 hover:border-red-400 font-medium text-sm
                   transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Delete Customer
      </button>

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete Customer</h2>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-700">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{customerName}</span>?
            </p>

            {/* ── Block if has orders ── */}
            {hasOrders ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  Cannot delete — customer has orders
                </p>
                <p className="text-sm text-red-700">
                  This customer has <strong>{orderCount}</strong> order
                  {orderCount !== 1 ? 's' : ''} on record.
                  You cannot delete a customer with existing orders as this
                  would remove invoice history.
                </p>
                <p className="text-sm text-red-600 mt-2">
                  To remove this customer, first cancel or reassign all their orders.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  This customer has <strong>no orders</strong> and can be safely deleted.
                  Their account and all associated data will be permanently removed.
                </p>
              </div>
            )}

            {/* ── Error message ── */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowConfirm(false); setError(null) }}
                disabled={deleting}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm
                           font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>

              {!hasOrders && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white
                             rounded-lg text-sm font-semibold transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <span className="animate-spin h-4 w-4 border-2 border-white
                                       border-t-transparent rounded-full" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Yes, Delete
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  )
}