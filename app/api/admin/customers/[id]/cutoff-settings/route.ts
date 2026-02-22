import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { default_cutoff_time, day_overrides } = await request.json();

    const supabase = await createClient();

    // Update default cutoff
    await supabase
      .from('customers')
      .update({ default_cutoff_time })
      .eq('id', id);

    // Delete existing overrides
    await supabase
      .from('customer_cutoff_overrides')
      .delete()
      .eq('customer_id', id);

    // Insert new overrides
    if (day_overrides && day_overrides.length > 0) {
      const validOverrides = day_overrides.filter((o: any) => o.time);
      if (validOverrides.length > 0) {
        await supabase.from('customer_cutoff_overrides').insert(
          validOverrides.map((o: any) => ({
            customer_id: id,
            day_of_week: o.day,
            cutoff_time: o.time,
          }))
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}