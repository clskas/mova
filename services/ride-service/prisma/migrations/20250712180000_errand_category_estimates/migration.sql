-- Estimation achats courses & commissions (admin CRUD)
CREATE TABLE IF NOT EXISTS "errand_category_estimates" (
  "category" "ErrandCategory" NOT NULL,
  "label" TEXT NOT NULL,
  "perItemCdf" INTEGER NOT NULL,
  "keywordPattern" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "errand_category_estimates_pkey" PRIMARY KEY ("category")
);

INSERT INTO "errand_category_estimates" ("category", "label", "perItemCdf", "keywordPattern", "sortOrder", "isActive", "updatedAt")
VALUES
  ('PHARMACY', 'Pharmacie', 8000, 'pharmac|médic|medic|drug|para-?pharm', 1, true, CURRENT_TIMESTAMP),
  ('MARKET', 'Marché', 3000, 'marché|marche|market|supermarch|commerce|épicer|epicer|boutique', 2, true, CURRENT_TIMESTAMP),
  ('OTHER', 'Autre', 5000, NULL, 3, true, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
