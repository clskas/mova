"use client";

import { useEffect, useRef, useState } from "react";
import { fetchGeoAutocomplete, type GeoSuggestion } from "@/lib/api";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: GeoSuggestion) => void;
  placeholder?: string;
  className?: string;
  city?: string;
};

export function GeoAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  className = "w-full rounded-xl border-0 bg-white p-3 shadow-sm",
  city,
}: Props) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2 || q === "Ma position") {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const list = await fetchGeoAutocomplete(q, city);
      setSuggestions(list);
      setOpen(list.length > 0);
      setLoading(false);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, city]);

  function pick(s: GeoSuggestion) {
    const label = s.label || s.address || "";
    onChange(label);
    onSelect?.(s);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-xl bg-white shadow-lg border border-gray-100 max-h-48 overflow-y-auto">
          {suggestions.slice(0, 6).map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#6C63FF]/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                {s.label || s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
