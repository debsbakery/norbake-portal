import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

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

  if (pathname.startsWith('/clock') || pathname.startsWith('/api/clock')) {
    return res
  }

  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi  = pathname.startsWith('/api/admin')
  if (!isAdminPage && !isAdminApi) return res

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const roleRes  = await fetch(
    `${req.nextUrl.origin}/api/auth/my-role`,
    { headers: { cookie: req.headers.get('cookie') ?? '' } }
  )
  const roleJson = roleRes.ok ? await roleRes.json() : { role: 'user' }
  const role     = (roleJson.role ?? 'user') as string

  const RANK: Record<string, number> = {
    owner: 4, manager: 3, staff_viewer: 2, user: 1,
  }
  const rank = (r: string) => RANK[r] ?? 0

  const deny = () => isAdminApi
    ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    : NextResponse.redirect(new URL('/admin/unauthorised', req.url))

  if (matches(pathname, MANAGER_ROUTES))  { if (rank(role) < rank('manager'))      return deny() }
  if (matches(pathname, STAFF_ROUTES))    { if (rank(role) < rank('staff_viewer')) return deny() }
  if (matches(pathname, VIEWER_ROUTES))   { if (rank(role) < rank('staff_viewer')) return deny() }

  if (pathname.startsWith('/admin/settings/roles') ||
      pathname.startsWith('/api/admin/settings/roles')) {
    if (rank(role) < rank('owner')) return deny()
  }

  // staff_viewer — block mutations on staff API
  if (matches(pathname, STAFF_ROUTES) && isAdminApi && rank(role) < rank('manager')) {
    const method = req.method.toUpperCase()
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return deny()
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}