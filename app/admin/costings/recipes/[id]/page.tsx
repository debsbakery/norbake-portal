export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import RecipeBuilder from './recipe-builder'

// ── Calculate cost per gram for any recipe ─────────────────────────────────
async function calcCostPerGram(
  supabase: ReturnType<typeof createAdminClient>,
  recipeId: string
): Promise<number> {
  const { data: lines } = await supabase
    .from('recipe_lines')
    .select(`
      quantity_grams,
      sub_qty_grams,
      ingredient_id,
      sub_recipe_id,
      ingredients ( unit_cost )
    `)
    .eq('recipe_id', recipeId)

  if (!lines || lines.length === 0) return 0

  let totalCost   = 0
  let totalWeight = 0

  for (const line of lines) {
    if (line.ingredient_id && line.ingredients) {
      const qty  = Number(line.quantity_grams  ?? 0)
      const cost = Number((line.ingredients as any).unit_cost ?? 0)
      totalCost   += (qty / 1000) * cost
      totalWeight += qty
    } else if (line.sub_recipe_id) {
      // Recursive — get sub-recipe cost per gram
      const subCostPerGram = await calcCostPerGram(supabase, line.sub_recipe_id)
      const qty = Number(line.sub_qty_grams ?? 0)
      totalCost   += qty * subCostPerGram
      totalWeight += qty
    }
  }

  return totalWeight > 0 ? totalCost / totalWeight : 0
}

export default async function RecipeBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      products (
        id,
        name,
        code,
        weight_grams
      )
    `)
    .eq('id', id)
    .single()

  if (error || !recipe) return notFound()

  const { data: lines } = await supabase
    .from('recipe_lines')
    .select(`
      *,
      ingredients (
        id,
        name,
        unit_cost
      ),
      sub_recipes:recipes!recipe_lines_sub_recipe_id_fkey (
        id,
        name,
        products ( name )
      )
    `)
    .eq('recipe_id', id)
    .order('id', { ascending: true })

  // ── Calculate cost per gram for each sub-recipe line ───────────────
  const subRecipeCosts: Record<string, number> = {}
  for (const line of lines ?? []) {
    if (line.sub_recipe_id && !subRecipeCosts[line.sub_recipe_id]) {
      subRecipeCosts[line.sub_recipe_id] = await calcCostPerGram(
        supabase,
        line.sub_recipe_id
      )
    }
  }

  const { data: allIngredients } = await supabase
    .from('ingredients')
    .select('*')
    .order('name', { ascending: true })

  const { data: allRecipes } = await supabase
    .from('recipes')
    .select(`
      id,
      name,
      products ( name )
    `)
    .neq('id', id)
    .order('id', { ascending: false })

  return (
    <RecipeBuilder
      recipe={recipe}
      lines={lines ?? []}
      allIngredients={allIngredients ?? []}
      allRecipes={allRecipes ?? []}
      subRecipeCosts={subRecipeCosts}
    />
  )
}