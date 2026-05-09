// app/api/clock/out/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }  from 'next/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { computeClockOut, computeTrustScore, haversineDistanceM } from '@/lib/services/time-snap-service'
import { calculateShift }             from '@/lib/services/shift-calculator'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { pin, token, lat, lng } = body

  if (!pin || !token) {
    return NextResponse.json({ error: 'PIN and QR token required' }, { status: 400 })
  }

  const supabase    = createAdminClient()
  const nowBrisbane = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' })
  )
  const today = nowBrisbane.toISOString().split('T')[0]

  // ── 1. Validate QR ────────────────────────────────────────────────────────
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

  // ── 3. Find today's clock-in ──────────────────────────────────────────────
  const { data: clockInEvent } = await supabase
    .from('clock_events')
    .select('id, paid_time, roster_entry_id')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_in')
    .gte('raw_time', today + 'T00:00:00+10:00')
    .order('raw_time', { ascending: false })
    .maybeSingle()

  if (!clockInEvent) {
    return NextResponse.json({
      error: `${staff.name} has not clocked in today`,
      not_in: true,
    }, { status: 409 })
  }

  // ── 4. Check not already clocked out after last clock-in ─────────────────
  const { data: existingOut } = await supabase
    .from('clock_events')
    .select('id')
    .eq('staff_id', staff.id)
    .eq('event_type', 'clock_out')
    .gte('raw_time', clockInEvent.paid_time)
    .maybeSingle()

  if (existingOut) {
    return NextResponse.json({
      error: `${staff.name} has already clocked out`,
      already_out: true,
    }, { status: 409 })
  }

  // ── 5. Find roster entry for snap logic ───────────────────────────────────
  const { data: rosterEntry } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('id', clockInEvent.roster_entry_id ?? '')
    .maybeSingle()

  const scheduledEnd = rosterEntry?.scheduled_end
    ? new Date(`${today}T${rosterEntry.scheduled_end}:00+10:00`)
    : null

  const paidStart = new Date(clockInEvent.paid_time)

  // ── 6. Compute snap ───────────────────────────────────────────────────────
  const { paidTime, snapReason } = computeClockOut({
    rawTime:        nowBrisbane,
    scheduledEnd,
    employmentType: staff.employment_type,
    paidStart,
  })

  // ── 7. GPS trust score ────────────────────────────────────────────────────
  let distanceM: number | null = null
  let gpsValid  = false
  if (lat && lng && location?.latitude) {
    distanceM = Math.round(haversineDistanceM(
      Number(lat), Number(lng),
      Number(location.latitude), Number(location.longitude)
    ))
    gpsValid = distanceM <= Number(location.radius_metres ?? 200)
  }
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ?? null
  const { score: trustScore, flags } = computeTrustScore({
    gpsValid, distanceM,
    radiusM: Number(location?.radius_metres ?? 200),
    ipMatchesSite: true,
  })

  // ── 8. Insert clock-out event ─────────────────────────────────────────────
  const { data: outEvent, error: evtErr } = await supabase
    .from('clock_events')
    .insert({
      staff_id:        staff.id,
      roster_entry_id: clockInEvent.roster_entry_id ?? null,
      event_type:      'clock_out',
      raw_time:        nowBrisbane.toISOString(),
      paid_time:       paidTime.toISOString(),
      snap_reason:     snapReason,
      gps_lat:         lat  ?? null,
      gps_lng:         lng  ?? null,
      gps_valid:       gpsValid,
      ip_address:      ipAddress,
      trust_score:     trustScore,
      flags:           flags.length > 0 ? flags : null,
    })
    .select()
    .single()

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 500 })

  // ── 9. Calculate shift pay ────────────────────────────────────────────────
  const calc = rosterEntry ? calculateShift({
    effectiveStart:           paidStart,
    effectiveEnd:             paidTime,
    breakMinutes:             Number(rosterEntry.break_minutes ?? 30),
    employmentType:           staff.employment_type,
    dayType:                  rosterEntry.day_type ?? 'normal',
    baseHourlyRate:           rosterEntry.base_hourly_rate,
    saturdayRate:             rosterEntry.saturday_rate,
    sundayRate:               rosterEntry.sunday_rate,
    publicHolidayRate:        rosterEntry.public_holiday_rate,
    publicHolidayMultiplier:  rosterEntry.public_holiday_multiplier,
    overtimeThresholdHours:   rosterEntry.overtime_threshold_hours,
    overtimeMultiplier:       rosterEntry.overtime_multiplier,
    doubleTimeThresholdHours: rosterEntry.double_time_threshold_hours,
    doubleTimeMultiplier:     rosterEntry.double_time_multiplier,
    salaryWeekly:             rosterEntry.salary_weekly,
    salaryHoursPerWeek:       rosterEntry.salary_hours_per_week,
    superRatePercent:         rosterEntry.super_rate_percent,
    trueHourlyCost:           rosterEntry.true_hourly_cost,
  }) : null

  // ── 10. Upsert shift record ───────────────────────────────────────────────
  if (calc && rosterEntry) {
    await supabase.from('shifts').upsert({
      staff_id:         staff.id,
      roster_entry_id:  rosterEntry.id,
      work_date:        today,
      section:          rosterEntry.section ?? 1,
      department:       rosterEntry.department,
      employment_type:  staff.employment_type,
      day_type:         rosterEntry.day_type ?? 'normal',
      clock_in_id:      clockInEvent.id,
      clock_out_id:     outEvent.id,
      effective_start:  paidStart.toISOString(),
      effective_end:    paidTime.toISOString(),
      gross_minutes:    calc.grossMinutes,
      break_minutes:    calc.breakMinutes,
      paid_minutes:     calc.paidMinutes,
      paid_hours:       calc.paidHours,
      applicable_rate:  calc.applicableRate,
      standard_hours:   calc.standardHours,
      standard_pay:     calc.standardPay,
      overtime_hours:   calc.overtimeHours,
      overtime_rate:    calc.overtimeRate,
      overtime_pay:     calc.overtimePay,
      double_time_hours: calc.doubleTimeHours,
      double_time_rate:  calc.doubleTimeRate,
      double_time_pay:   calc.doubleTimePay,
      gross_pay:         calc.grossPay,
      super_amount:      calc.superAmount,
      leave_loading_amount: calc.leaveLoadingAmount,
      true_shift_cost:   calc.trueShiftCost,
      true_hourly_cost:  rosterEntry.true_hourly_cost,
      is_salary:         calc.isSalary,
      salary_daily_cost: calc.salaryDailyCost,
      status:            'pending',
    }, { onConflict: 'staff_id,work_date,section' })

    // Update roster status to 'completed'
    await supabase.from('roster_entries')
      .update({ status: 'completed' })
      .eq('id', rosterEntry.id)

    // Update customer balance (only for hourly)
    if (!calc.isSalary) {
      const { data: customer } = await supabase
        .from('staff')
        .select('id')
        .eq('id', staff.id)
        .single()
    }
  }

  const paidHours = calc?.paidHours ?? 0
  const grossPay  = calc?.grossPay  ?? null

  return NextResponse.json({
    success:     true,
    staff_name:  staff.name,
    clocked_out: paidTime.toTimeString().slice(0, 5),
    clocked_in:  paidStart.toTimeString().slice(0, 5),
    paid_hours:  paidHours,
    gross_pay:   grossPay,
    snap_reason: snapReason,
    trust_score: trustScore,
    flags,
    message: `✅ ${staff.name} clocked out at ${paidTime.toTimeString().slice(0,5)} — ${paidHours.toFixed(2)} hrs${
      grossPay !== null ? ` ($${grossPay.toFixed(2)})` : ''
    }`,
  })
}