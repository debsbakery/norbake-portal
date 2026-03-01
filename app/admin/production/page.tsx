export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft, Package } from "lucide-react";
import ProductionForecastView from "./production-forecast-view";
import ProductionSheetLauncher from "./production-sheet-launcher";   // ← ADD

export default async function ProductionDashboardPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <a
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: "#CE1126" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </a>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8" style={{ color: "#006A4E" }} />
              Production Forecast
            </h1>
            <p className="text-gray-600">
              Plan daily production based on confirmed orders and standing orders
            </p>
          </div>

          {/* ── Replaces the old Link button ── */}
          <ProductionSheetLauncher />
        </div>
      </div>

      <ProductionForecastView />
    </div>
  );
}