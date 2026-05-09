// app/api/clock/in/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }  from 'next/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { computeClockIn, computeTrustScore, haversineDistanceM } from '@/lib/services/time-snap-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { pin, token, lat, lng, accuracy } = body

  if (!pin || !token) {
    return NextResponse.json({ error: 'PIN and QR token required' }, { status: 400 })
  }

  const supabase  = createAdminClient()
  const nowLocal = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })
  )

  // ── 1. Validate QR token ──────────────────────────────────────────────────
  const { data: qr } = await supabase
    .from('staff_qr_codes')
    .select('id, location_id, staff_locations(id, name, latitude, longitude, radius_metres)')
    .eq('token', token)
    .eq('active', true)
    .maybeSingle()

  if (!qr) {
    return NextResponse.json({ error: 'Invalid QR code' }, { status: 401 })
  }

  const location = qr.staff_locations as any

  // ── 2. Validate PIN ───────────────────────────────────────────────────────
  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, employment_type, active')
    .eq('pin', String(pin))
    .eq('active', true)
    .maybeSingle()

  if (!staff) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }

  // ── 3. Check not already clocked in today ─────────────────────────────────
  const today = nowLocal.toISOString().split('T')[0]
  const { data: existingIn } = await supabase
    .from('clock_events')
    .select('id, raw_time')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_in')
    .gte('raw_time', today + 'T00:00:00+10:00')
    .maybeSingle()

  if (existingIn) {
    // Check if they've also clocked out (split shift — allow second clock-in)
    const { data: existingOut } = await supabase
      .from('clock_events')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('event_type', 'clock_out')
      .gte('raw_time', today + 'T00:00:00+10:00')
      .maybeSingle()

    if (!existingOut) {
      return NextResponse.json({
        error: `${staff.name} is already clocked in today`,
        already_in: true,
      }, { status: 409 })
    }
  }

  // ── 4. Find today's roster entry ──────────────────────────────────────────
  const { data: rosterEntry } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('work_date', today)
    .neq('status', 'rostered_off')
    .order('section', { ascending: true })
    .maybeSingle()

  // ── 5. Compute snap ───────────────────────────────────────────────────────
  const scheduledStart = rosterEntry?.scheduled_start
    ? new Date(`${today}T${rosterEntry.scheduled_start}:00+10:00`)
    : null

  const { paidTime, snapReason } = computeClockIn({
    rawTime:        nowLocal,
    scheduledStart,
    employmentType: staff.employment_type,
  })

  // ── 6. GPS trust score ────────────────────────────────────────────────────
  let distanceM: number | null = null
  let gpsValid  = false

  if (lat && lng && location?.latitude && location?.longitude) {
    distanceM = Math.round(haversineDistanceM(
      Number(lat), Number(lng),
      Number(location.latitude), Number(location.longitude)
    ))
    gpsValid = distanceM <= Number(location.radius_metres ?? 200)
  }

  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ?? null
  const { score: trustScore, flags } = computeTrustScore({
    gpsValid,
    distanceM,
    radiusM: Number(location?.radius_metres ?? 200),
    ipMatchesSite: true,  // simplified — can enhance later
  })

  // ── 7. Insert clock event ─────────────────────────────────────────────────
  const { data: event, error: evtErr } = await supabase
    .from('clock_events')
    .insert({
      staff_id:        staff.id,
      roster_entry_id: rosterEntry?.id ?? null,
      event_type:      'clock_in',
      raw_time:        nowLocal.toISOString(),
      paid_time:       paidTime.toISOString(),
      snap_reason:     snapReason,
      gps_lat:         lat   ?? null,
      gps_lng:         lng   ?? null,
      gps_valid:       gpsValid,
      ip_address:      ipAddress,
      trust_score:     trustScore,
      flags:           flags.length > 0 ? flags : null,
    })
    .select()
    .single()

  if (evtErr) {
    return NextResponse.json({ error: evtErr.message }, { status: 500 })
  }

  // ── 8. Update roster entry status to 'present' ────────────────────────────
  if (rosterEntry) {
    await supabase
      .from('roster_entries')
      .update({ status: 'present' })
      .eq('id', rosterEntry.id)
  }
return NextResponse.json({
  success:        true,
  staff_name:     staff.name,
  raw_time:       nowLocal.toTimeString().slice(0, 5),    // ✅ actual time
  clocked_in:     paidTime.toTimeString().slice(0, 5),       // paid time (snapped)
  is_early_late:  paidTime.getTime() !== nowLocal.getTime(),
  snap_reason:    snapReason,
  trust_score:    trustScore,
  flags,
  gps_distance:   distanceM,
  message: `✅ ${staff.name} clocked in at ${nowLocal.toTimeString().slice(0, 5)}`,
})
}