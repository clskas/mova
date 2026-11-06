"use client";

import { useState } from "react";
import { scanMenuPhotos, uploadMenuPhoto, type MenuItem, type ScannedMenuItem } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

type Row = ScannedMenuItem & { selected: boolean; price: string };

/**
 * « Importer depuis une photo du menu (IA) » : Claude lit le menu photographié,
 * le partenaire vérifie chaque ligne (nom, prix) puis ajoute celles qu'il garde.
 */
export function MenuScanPanel({
  disabled,
  existingNames,
  onImport,
}: {
  disabled?: boolean;
  existingNames: string[];
  onImport: (items: MenuItem[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setRows([]);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 3)) urls.push(await uploadMenuPhoto(file));
      const result = await scanMenuPhotos(urls);
      if (!result.available) {
        setError(result.message ?? "Lecture automatique indisponible — saisissez le menu à la main.");
        return;
      }
      if (result.isMenu === false || result.items.length === 0) {
        setError("Aucun plat lisible sur cette photo. Prenez le menu de face, bien éclairé, sans reflet.");
        return;
      }
      setRows(
        result.items.map((it) => ({
          ...it,
          selected: !known.has(it.name.toLowerCase()),
          price: it.unitPriceCdf != null ? String(it.unitPriceCdf) : "",
        })),
      );
      setNote(result.notes || null);
    } catch (e) {
      setError(toUserErrorMessage(e, "Lecture du menu impossible"));
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const chosen = rows.filter((r) => r.selected);
  const missingPrice = chosen.filter((r) => !(Number(r.price) > 0)).length;

  function importSelected() {
    const items: MenuItem[] = chosen
      .filter((r) => Number(r.price) > 0)
      .map((r) => ({
        name: r.name.trim(),
        unitPriceCdf: Math.round(Number(r.price)),
        description: [r.category, r.description].filter(Boolean).join(" — ") || undefined,
        isAvailable: true,
      }));
    if (items.length === 0) return;
    onImport(items);
    setRows([]);
    setNote(null);
  }

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Importer depuis une photo du menu (IA)</h3>
          <p className="text-sm text-gray-500">
            Photographiez votre menu (3 photos max) : les plats et prix sont proposés, vous vérifiez avant d&apos;ajouter.
          </p>
        </div>
        <label
          className={`px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer ${
            disabled || busy ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
          }`}
        >
          {busy ? "Lecture en cours…" : "Choisir les photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={disabled || busy}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-sm">{error}</div>}
      {note && <p className="text-xs text-gray-500">{note}</p>}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Plat</th>
                  <th className="p-2 w-36">Prix (FC)</th>
                  <th className="p-2">Rubrique / note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-t">
                    <td className="p-2">
                      <input type="checkbox" checked={r.selected} onChange={(e) => update(i, { selected: e.target.checked })} />
                    </td>
                    <td className="p-2">
                      <input
                        className="w-full rounded-lg border px-2 py-1"
                        value={r.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                      {known.has(r.name.trim().toLowerCase()) && (
                        <span className="text-xs text-amber-700">Déjà au menu</span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        className="w-full rounded-lg border px-2 py-1"
                        inputMode="numeric"
                        value={r.price}
                        placeholder={r.priceUsd != null ? `${r.priceUsd} $ → en FC ?` : "à saisir"}
                        onChange={(e) => update(i, { price: e.target.value.replace(/[^0-9]/g, "") })}
                      />
                    </td>
                    <td className="p-2 text-gray-600">{[r.category, r.description].filter(Boolean).join(" — ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {chosen.length} plat(s) sélectionné(s)
              {missingPrice > 0 ? ` — ${missingPrice} sans prix ne seront pas ajoutés` : ""}. Vérifiez les prix : l&apos;IA peut se tromper.
            </p>
            <div className="flex gap-2">
              <button type="button" className="px-4 py-2 rounded-xl border text-sm" onClick={() => setRows([])}>
                Annuler
              </button>
              <button
                type="button"
                disabled={disabled || chosen.length === missingPrice}
                onClick={importSelected}
                className="px-4 py-2 rounded-xl bg-[#FF6B35] text-white text-sm font-medium disabled:opacity-50"
              >
                Ajouter au menu
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
