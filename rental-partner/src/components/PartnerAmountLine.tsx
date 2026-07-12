import { formatCdf } from "@/lib/api";

type Props = {
  subtotalCdf?: number;
  partnerNetCdf?: number;
  partnerDiscountCdf?: number;
  promoCode?: string | null;
  subtotalLabel?: string;
};

export function PartnerAmountLine({
  subtotalCdf,
  partnerNetCdf,
  partnerDiscountCdf = 0,
  promoCode,
  subtotalLabel = "Sous-total location",
}: Props) {
  if (subtotalCdf == null && partnerNetCdf == null) return null;
  return (
    <div className="text-sm space-y-0.5">
      {subtotalCdf != null && (
        <p>
          <span className="text-gray-500">{subtotalLabel} :</span>{" "}
          <span className="font-medium text-[#1A1A2E]">{formatCdf(subtotalCdf)}</span>
        </p>
      )}
      {partnerDiscountCdf > 0 && (
        <p className="text-xs text-amber-700">
          Remise{promoCode ? ` ${promoCode}` : ""} : −{formatCdf(partnerDiscountCdf)} (à votre charge)
        </p>
      )}
      {partnerNetCdf != null && (
        <p>
          <span className="text-gray-500">Votre part :</span>{" "}
          <span className="font-semibold text-green-700">{formatCdf(partnerNetCdf)}</span>
        </p>
      )}
    </div>
  );
}
