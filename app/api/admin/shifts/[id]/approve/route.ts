// POST /api/admin/shifts/[id]/approve
// Body: { approved_by_id: string }  ← UUID of the manager auth user
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const { approved_by_id } = await req.json()

  if (!approved_by_id) {
    return NextResponse.json({ error: 'approved_by_id (UUID) is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('shifts')
    .update({
      status:      'approved',
      approved_by: approved_by_id,   // UUID ✅
      approved_at: now,
      manager_note: null,            // clear any dispute note on approval
    })
    .eq('id', params.id)
    .select(`
      id, staff_id, work_date, effective_start, effective_end,
      paid_hours, gross_pay, status, approved_by, approved_at
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to clock_events using override fields that already exist
  await supabase.from('clock_events').insert({
    staff_id:        data.staff_id,
    roster_entry_id: null,
    event_type:      'manager_approval',
    raw_time:        now,
    paid_time:       now,
    snap_reason:     'manager_approved',
    overridden_by:   approved_by_id,
    overridden_at:   now,
    override_reason: `Shift approved for ${data.work_date}`,
  })

  return NextResponse.json({ shift: data })
}