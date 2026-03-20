// app/api/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_name, contact_name, email, phone, address, abn, delivery_notes } = body

    // ── Validation ────────────────────────────────────────────
    if (!business_name?.trim()) return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    if (!contact_name?.trim())  return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    if (!email?.trim())         return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    // ── Check duplicate email ─────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id, status')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      const msg = existing.status === 'pending'
        ? 'This email is already registered and awaiting approval.'
        : 'This email is already registered. Please contact us if you need help.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    // ── Insert customer as pending (NO auth user yet) ─────────
    // Auth user is created when Deb approves — not before
    const customerId = crypto.randomUUID()

    const { error: insertError } = await supabaseAdmin
      .from('customers')
      .insert({
        id:             customerId,
        business_name:  business_name.trim(),
        contact_name:   contact_name.trim(),
        email:          email.trim().toLowerCase(),
        phone:          phone?.trim()          || null,
        address:        address?.trim()        || null,
        abn:            abn?.trim()            || null,
        delivery_notes: delivery_notes?.trim() || null,
        status:         'pending',
        balance:        0,
        payment_terms:  30,
      })

    if (insertError) {
      console.error('Customer insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // ── Notify Deb by email ───────────────────────────────────
    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/admin/customers`
    const bakeryEmail = process.env.BAKERY_EMAIL

    if (bakeryEmail) {
      try {
        await resend.emails.send({
          from:    `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
          to:      bakeryEmail,
          subject: `New wholesale account application — ${business_name.trim()}`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
              <div style="background:#006A4E;padding:24px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0;font-size:20px">New Account Application</h1>
                <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">
                  Deb's Bakery — Wholesale Portal
                </p>
              </div>

              <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none">
                <p style="color:#374151;font-size:14px;margin:0 0 16px">
                  A new customer has submitted a wholesale account application:
                </p>

                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280;width:140px">Business Name</td>
                    <td style="padding:8px 0;color:#111827;font-weight:600">${business_name.trim()}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280">Contact Name</td>
                    <td style="padding:8px 0;color:#111827">${contact_name.trim()}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280">Email</td>
                    <td style="padding:8px 0;color:#111827">${email.trim().toLowerCase()}</td>
                  </tr>
                  ${phone ? `
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280">Phone</td>
                    <td style="padding:8px 0;color:#111827">${phone.trim()}</td>
                  </tr>` : ''}
                  ${address ? `
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280">Address</td>
                    <td style="padding:8px 0;color:#111827">${address.trim()}</td>
                  </tr>` : ''}
                  ${abn ? `
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:8px 0;color:#6b7280">ABN</td>
                    <td style="padding:8px 0;color:#111827">${abn.trim()}</td>
                  </tr>` : ''}
                  ${delivery_notes ? `
                  <tr>
                    <td style="padding:8px 0;color:#6b7280">Delivery Notes</td>
                    <td style="padding:8px 0;color:#111827">${delivery_notes.trim()}</td>
                  </tr>` : ''}
                </table>

                <div style="margin-top:24px;text-align:center">
                  <a
                    href="${adminUrl}"
                    style="background:#CE1126;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block"
                  >
                    Review &amp; Approve in Admin
                  </a>
                </div>

                <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px">
                  Go to Admin → Customers → find ${business_name.trim()} → click Approve
                </p>
              </div>
            </div>
          `,
        })
      } catch (emailError) {
        // Don't fail the registration if email fails
        console.error('Notification email failed:', emailError)
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}