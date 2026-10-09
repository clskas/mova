"use client";

import { useEffect, useState } from "react";

type Props = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  disabled?: boolean;
  /** Vide → null (défaut). Si false, vide → 0. */
  emptyAsNull?: boolean;
};

/**
 * Champ numérique où le 0 / la valeur se sélectionne au focus
 * et peut être effacé sans repasser immédiatement à 0.
 */
export function NumberField({
  value,
  onChange,
  className = "",
  min,
  max,
  step,
  placeholder,
  disabled,
  emptyAsNull = true,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    if (focused) return;
    setRaw(value == null || Number.isNaN(value) ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      value={focused ? raw : value == null || Number.isNaN(value) ? "" : String(value)}
      onFocus={(e) => {
        setFocused(true);
        setRaw(value == null || Number.isNaN(value) ? "" : String(value));
        requestAnimationFrame(() => e.currentTarget.select());
      }}
      onBlur={() => {
        setFocused(false);
        if (raw.trim() === "") {
          onChange(emptyAsNull ? null : 0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onChange={(e) => {
        const t = e.target.value;
        setRaw(t);
        if (t.trim() === "") {
          onChange(emptyAsNull ? null : 0);
          return;
        }
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
