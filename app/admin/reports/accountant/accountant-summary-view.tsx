'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, TrendingUp, Package, AlertCircle, FileText } from 'lucide-react'

interface Props {
  data: {
    month: string
    totalSales: number
    gstCollected: number
    invoiced: number
    credits: number
    payments: number
    arBalance: number
    ingredientCost: number
    stockValue: number
    stockDate: string | null
  }
}

export default function AccountantSummaryView({ data }: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(data.month)

  function handleMonthChange(newMonth: string) {
    setMonth(newMonth)
    router.push('/admin/reports/accountant?month=' + newMonth)
  }

  const netSales = data.totalSales - data.gstCollected

  return (
    <div className="space-y-6">

      {/* Month Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Select Month
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Reporting Period</p>
          <p className="text-lg font-bold text-gray-800">
            {new Date(month + '-01').toLocaleDateString('en-AU', {
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Sales Summary */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-green-50 border-b border-green-200">
          <h2 className="font-bold text-green-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Sales Summary
          </h2>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Sales (inc GST)</span>
            <span className="text-2xl font-bold text-gray-900">
              ${data.totalSales.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">GST Collected</span>
            <span className="font-semibold text-gray-700">
              ${data.gstCollected.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-gray-200">
            <span className="font-semibold text-gray-800">Net Sales (ex GST)</span>
            <span className="text-xl font-bold text-green-700">
              ${netSales.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* AR Summary */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
          <h2 className="font-bold text-blue-900 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Accounts Receivable
          </h2>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Invoiced this month</span>
            <span className="font-semibold text-gray-900">
              ${data.invoiced.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Credits issued</span>
            <span className="font-semibold text-red-600">
              -${data.credits.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Payments received</span>
            <span className="font-semibold text-green-600">
              ${data.payments.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-gray-200">
            <span className="font-semibold text-gray-800">Current AR Balance</span>
            <span className="text-xl font-bold text-blue-700">
              ${data.arBalance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-200">
          <h2 className="font-bold text-amber-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cost Summary
          </h2>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Ingredient Purchases</span>
            <span className="text-lg font-bold text-gray-900">
              ${data.ingredientCost.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <span className="text-gray-600 block">Wages</span>
              <span className="text-xs text-gray-400">Manual entry required</span>
            </div>
            <span className="text-gray-400 font-semibold">—</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <span className="text-gray-600 block">Overheads</span>
              <span className="text-xs text-gray-400">Manual entry required</span>
            </div>
            <span className="text-gray-400 font-semibold">—</span>
          </div>
        </div>
      </div>

      {/* Stock on Hand */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-200">
          <h2 className="font-bold text-indigo-900 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Stock on Hand
          </h2>
        </div>
        <div className="p-6">
          {data.stockDate ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Ingredient Stock Value</span>
                <span className="text-2xl font-bold text-indigo-700">
                  ${data.stockValue.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                As at {new Date(data.stockDate).toLocaleDateString('en-AU')}
              </p>
              <a
                href="/admin/stock-take"
                className="inline-block text-xs font-semibold text-indigo-600 hover:underline mt-2"
              >
                View stock takes →
              </a>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  No stock take completed yet
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Complete a stock take to see ingredient stock value here.
                </p>
                <a
                  href="/admin/stock-take"
                  className="inline-block text-xs font-semibold text-amber-700 hover:underline mt-2"
                >
                  Go to stock take →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-bold text-gray-800 mb-4">Related Reports</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="/admin/gst-report"
            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700 text-center"
          >
            GST Report
          </a>
          <a
            href="/admin/statements"
            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700 text-center"
          >
            AR Statements
          </a>
          <a
            href="/admin/reports/stales"
            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700 text-center"
          >
            Stales Analysis
          </a>
        </div>
      </div></div>
  )
}