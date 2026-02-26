import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params

  try {
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !customer)
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const { error: updateError } = await supabase
      .from('customers')
      .update({
        status:      'active',
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) throw updateError

    // Send portal invite email
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      customer.email,
      {
        data: {
          customer_id:   id,
          business_name: customer.business_name,
          role:          'customer',
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://debsbakery.store'}/portal`,
      }
    )

    if (inviteError) {
      console.error('Invite email failed (customer still approved):', inviteError.message)
    }

    return NextResponse.redirect(new URL('/admin/customers/pending', request.url))
  } catch (error: any) {
    console.error('Approve error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}