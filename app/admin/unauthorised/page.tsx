import Link from 'next/link'

export default function UnauthorisedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4 max-w-md mx-auto p-8">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
        <p className="text-gray-600">
          You don't have permission to view this page.
          Staff wages and personal information are restricted to authorised managers only.
        </p>
        <p className="text-sm text-gray-400">
          Contact the bakery owner if you need access.
        </p>
        <Link href="/admin"
          className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  )
}