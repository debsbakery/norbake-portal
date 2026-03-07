export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import RecipesView from './recipes-view'

export default async function RecipesPage() {
  const supabase = createAdminClient()

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select(`
      *,
      products (
        id,
        name,
        code
      )
    `)
    .order('id', { ascending: false })

  // Fetch products that don't already have a recipe
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, code')
    .eq('is_available', true)
    .order('code', { ascending: true })

  // Get product IDs that already have recipes
  const usedProductIds = (recipes ?? [])
    .filter(r => r.product_id)
    .map(r => r.product_id)

  // Only show products without a recipe yet
  const availableProducts = (allProducts ?? []).filter(
    p => !usedProductIds.includes(p.id)
  )

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Failed to load recipes: {error.message}
      </div>
    )
  }

  return (
    <RecipesView
      recipes={recipes ?? []}
      availableProducts={availableProducts}
    />
  )
}