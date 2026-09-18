"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCommerceCopy, useCommerceType } from "@/components/CommerceTypeContext";
import { commerceManuelChapters } from "@/lib/commerce-type";

export default function RestaurantManuelPage() {
  const commerceType = useCommerceType();
  const copy = useCommerceCopy();
  const chapters = useMemo(() => commerceManuelChapters(commerceType), [commerceType]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold">Manuel utilisateur</h2>
        <p className="text-sm text-gray-500 mt-1">{copy.guideSubtitle}</p>
      </div>
      {chapters.map((chapter) => (
        <details key={chapter.title} className="bg-white border rounded-xl p-3" open>
          <summary className="font-medium text-sm cursor-pointer">{chapter.title}</summary>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-gray-600">
            {chapter.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
      <p className="text-sm text-gray-500">
        Contacts et questions :{" "}
        <Link href="/aide" className="text-orange-700 underline font-medium">
          Aide
        </Link>
        .
      </p>
    </div>
  );
}
