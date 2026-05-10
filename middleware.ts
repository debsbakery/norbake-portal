import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const MANAGER_ROUTES = [
  '/admin/hours',
  '/admin/payroll',
  '/api/admin/shifts',
  '/api/admin/payroll',
]

const STAFF_ROUTES = [
  '/admin/staff',
  '/api/admin/staff',
]

const VIEWER_ROUTES = [
  '/admin/roster',
  '/api/admin/roster',
]

function matches(pathname: string, patterns: string[]) {
  return patterns.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const res = NextResponse.next()

  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi  = pathname.startsWith('/api/admin')

  // Skip clock routes — public QR pages need no auth
  if (pathname.startsWith('/clock') || pathname.startsWith('/api/clock')) {
    return res
  }

  if (!isAdminPage && !isAdminApi) return res

  // Build SSR Supabase client to read session cookie
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in
  if (!user) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Fetch role via internal API route
  const roleRes = await fetch(
    `${req.nextUrl.origin}/api/auth/my-role`,
    { headers: { cookie: req.headers.get('cookie') ?? '' } }
  )
  const roleJson  = roleRes.ok ? await roleRes.json() : { role: 'user' }
  const role: string = roleJson.role ?? 'user'

  const RANK: Record<string, number> = {
    owner: 4, manager: 3, staff_viewer: 2, user: 1,
  }
  const rank = (r: string) => RANK[r] ?? 0

  const deny = () => isAdminApi
    ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    : NextResponse.redirect(new URL('/admin/unauthorised', req.url))

  // Manager-only routes
  if (matches(pathname, MANAGER_ROUTES)) {
    if (rank(role) < rank('manager')) return deny()
  }

  // Staff routes — staff_viewer can GET, manager+ can mutate
  if (matches(pathname, STAFF_ROUTES)) {
    if (rank(role) < rank('staff_viewer')) return deny()
    if (isAdminApi && rank(role) < rank('manager')) {
      const method = req.method.toUpperCase()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return deny()
    }
  }

  // Roster — staff_viewer+
  if (matches(pathname, VIEWER_ROUTES)) {
    if (rank(role) < rank('staff_viewer')) return deny()
  }

  // Settings/roles — owner only
  if (pathname.startsWith('/admin/settings/roles') || pathname.startsWith('/api/admin/settings/roles')) {
    if (rank(role) < rank('owner')) return deny()
  }

  return res
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}