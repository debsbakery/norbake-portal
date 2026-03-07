export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { calcProductCosting } from '@/lib/costings'
import CostingsView from './costings-view'

export default async function CostingsPage() {
  const supabase = createAdminClient()

  // Get global settings
  const { data: settings } = await supabase
    .from('cost_settings')
    .select('setting_key, value')

  const globalLabourPct = Number(
    settings?.find(s => s.setting_key === 'labour_pct')?.value ?? 30
  )
  const overheadPerKg = Number(
    settings?.find(s => s.setting_key === 'overhead_per_kg')?.value ?? 30
  )

  // Get all active products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, code, price, weight_grams, labour_pct, is_available')
    .eq('is_available', true)
    .order('code', { ascending: true, nullsFirst: false })

  // Get all product recipes
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, product_id')
    .not('product_id', 'is', null)

  const recipeMap = new Map((recipes ?? []).map(r => [r.product_id, r]))

  // Calculate costing for each product
  const costings = await Promise.all(
    (products ?? []).map(p =>
      calcProductCosting(
        supabase,
        p,
        recipeMap.get(p.id) ?? null,
        globalLabourPct,
        overheadPerKg
      )
    )
  )

  return (
    <CostingsView
      costings={costings}
      globalLabourPct={globalLabourPct}
      overheadPerKg={overheadPerKg}
    />
  )
}