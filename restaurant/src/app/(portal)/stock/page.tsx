"use client";

export default function StockPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-[#1A1A2E]">Stock</h2>
      <p className="text-sm text-gray-600">
        Suivez les niveaux de stock et les ruptures. Module prévu pour supermarchés et boutiques.
      </p>
      <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 px-4 py-8 text-center text-sm text-orange-800">
        Stock — bientôt disponible
      </div>
    </div>
  );
}
