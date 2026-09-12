"use client";

export default function RestrictionsPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-[#1A1A2E]">Restrictions</h2>
      <p className="text-sm text-gray-600">
        Définissez les règles de vente (ordonnances, âges, produits réglementés) pour votre pharmacie.
      </p>
      <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 px-4 py-8 text-center text-sm text-orange-800">
        Restrictions — bientôt disponible
      </div>
    </div>
  );
}
