import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { ingredient_id, quantity_grams, sub_recipe_id, sub_qty_grams } = await req.json()

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('recipe_lines')
      .insert({
        recipe_id: params.id,
        ingredient_id: ingredient_id || null,
        quantity_grams: quantity_grams || null,
        sub_recipe_id: sub_recipe_id || null,
        sub_qty_grams: sub_qty_grams || null,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { line_id } = await req.json()

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('recipe_lines')
      .delete()
      .eq('id', line_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}