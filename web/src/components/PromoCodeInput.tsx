"use client";

type PromoCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function PromoCodeInput({ value, onChange, className = "" }: PromoCodeInputProps) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-gray-600">Code promo (optionnel)</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="MOVA10"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm uppercase outline-none focus:border-[#6C63FF]"
      />
    </label>
  );
}

export function promoPayload(code: string): { promoCode?: string } {
  const trimmed = code.trim();
  return trimmed ? { promoCode: trimmed } : {};
}
