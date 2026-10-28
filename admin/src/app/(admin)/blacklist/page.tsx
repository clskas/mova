"use client";

import { useCallback, useEffect, useState } from "react";
import { deactivateBlacklist, fetchBlacklist, upsertBlacklist } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  PageHeader,
  SelectInput,
  TextInput,
} from "@/components/ui";

export default function BlacklistPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("blacklist") && !canWrite("utilisateurs");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchBlacklist>>["data"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("PHONE");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBlacklist({ take: 100 });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur liste noire");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || !value.trim() || !reason.trim()) return;
    setSaving(true);
    try {
      await upsertBlacklist({ type, value: value.trim(), reason: reason.trim() });
      setValue("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec ajout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader title="Liste noire" subtitle="Blocage téléphone, e-mail, compte, appareil ou plaque" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!readOnly && (
        <form onSubmit={addEntry} className="bg-white rounded-xl border p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <label>
              <FieldLabel>Type</FieldLabel>
              <SelectInput
                value={type}
                onChange={setType}
                options={[
                  { value: "PHONE", label: "Téléphone" },
                  { value: "EMAIL", label: "E-mail" },
                  { value: "USER_ID", label: "User ID" },
                  { value: "DEVICE", label: "Appareil" },
                  { value: "PLATE", label: "Plaque" },
                ]}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Valeur</FieldLabel>
              <TextInput value={value} onChange={setValue} placeholder="+243…" />
            </label>
          </div>
          <label>
            <FieldLabel>Motif</FieldLabel>
            <TextInput value={reason} onChange={setReason} placeholder="Motif du blocage" />
          </label>
          <BtnPrimary type="submit" disabled={saving}>Ajouter</BtnPrimary>
        </form>
      )}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune entrée active" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Type</th>
                <th className="p-3">Valeur</th>
                <th className="p-3">Motif</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 text-xs">{r.type}</td>
                  <td className="p-3 font-mono text-xs">{r.value}</td>
                  <td className="p-3">{r.reason}</td>
                  <td className="p-3">
                    {!readOnly && (
                      <BtnDanger
                        onClick={async () => {
                          await deactivateBlacklist(r.id);
                          await load();
                        }}
                      >
                        Lever
                      </BtnDanger>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
