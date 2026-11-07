"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchClientAppsConfig, updateClientAppsConfig, type LanguagesConfig } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const DEFAULTS: LanguagesConfig = { en: true, sw: true, ln: true, pickerVisible: true };

const LANGS: Array<{ key: "en" | "sw" | "ln"; label: string; hint: string }> = [
  { key: "en", label: "English (anglais)", hint: "Traduction intégrée à l’application." },
  {
    key: "sw",
    label: "Kiswahili (swahili)",
    hint: "Traduit automatiquement par l’IA sur le serveur, puis téléchargé par l’app. Les textes pas encore traduits restent en français.",
  },
  {
    key: "ln",
    label: "Lingala",
    hint: "Traduit automatiquement par l’IA sur le serveur, puis téléchargé par l’app. Les textes pas encore traduits restent en français.",
  },
];

/** SuperAdmin: language buttons shown in the SENGA and SENGA Driver apps. */
export default function LanguesPage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [value, setValue] = useState<LanguagesConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const cfg = await fetchClientAppsConfig();
      setValue({ ...DEFAULTS, ...(cfg.languages ?? {}) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les langues");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!value) return;
    setSaving(true);
    setOk(null);
    setError(null);
    try {
      const next = await updateClientAppsConfig({ languages: value });
      setValue({ ...DEFAULTS, ...(next.languages ?? {}) });
      setOk("Langues enregistrées. Les apps les appliquent à leur prochaine ouverture.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <PageHeader
        title="Langues des applications"
        subtitle="Afficher ou masquer les boutons de langue dans SENGA et SENGA Driver. Le français est toujours disponible. Réservé aux SuperAdmin."
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>}
      {!value ? (
        <LoadingState />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-4" data-testid="language-settings">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={value.pickerVisible}
              disabled={readOnly || saving}
              onChange={(e) => setValue({ ...value, pickerVisible: e.target.checked })}
            />
            <span>
              <span className="font-medium text-slate-800">Afficher le choix de langue dans les apps</span>
              <span className="block text-xs text-slate-500">
                Décoché : la carte « Langue » disparaît du profil et tout le monde repasse en français.
              </span>
            </span>
          </label>
          <div className={`space-y-3 pl-6 ${value.pickerVisible ? "" : "opacity-50"}`}>
            {LANGS.map((l) => (
              <label key={l.key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={value[l.key]}
                  disabled={readOnly || saving || !value.pickerVisible}
                  onChange={(e) => setValue({ ...value, [l.key]: e.target.checked })}
                />
                <span>
                  <span className="font-medium text-slate-800">{l.label}</span>
                  <span className="block text-xs text-slate-500">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Une langue masquée n’est plus traduite par le serveur (pas de coût IA). Les personnes qui l’utilisaient
            repassent en français à la prochaine ouverture de l’app.
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="text-sm px-3 py-1.5 rounded-lg bg-[#6C63FF] text-white disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
