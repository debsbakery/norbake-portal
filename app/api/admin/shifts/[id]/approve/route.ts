// POST /api/admin/shifts/[id]/approve
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const { approved_by } = await req.json()

  const { data, error } = await supabase
    .from('shifts')
    .update({
      approval_status: 'approved',
      approved_by: approved_by ?? 'manager',
      approved_at: new Date().toISOString(),
      status: 'approved',
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log approval event to clock_events
  await supabase.from('clock_events').insert({
    staff_id: data.staff_id,
    shift_id: data.id,
    event_type: 'approved',
    event_time: new Date().toISOString(),
    source: 'manager',
    notes: `Approved by ${approved_by ?? 'manager'}`,
  })

  return NextResponse.json({ shift: data })
}