"use client";

import { useEffect, useState } from "react";
import {
  fetchReceipt,
  fetchReceiptPdfBlob,
  formatCdf,
  sendReceiptEmail,
  shareReceiptInChat,
  type MovaReceipt,
} from "@/lib/api";

type Props = {
  referenceType: string;
  referenceId: string;
  onBack: () => void;
};

export function ReceiptView({ referenceType, referenceId, onBack }: Props) {
  const [receipt, setReceipt] = useState<MovaReceipt | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchReceipt(referenceType, referenceId)
      .then((data) => {
        setReceipt(data);
        setEmail(data.customer?.email ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [referenceType, referenceId]);

  async function downloadPdf() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await fetchReceiptPdfBlob(referenceType, referenceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${receipt?.receiptNumber ?? "mova-receipt"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF indisponible");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await sendReceiptEmail(referenceType, referenceId, email.trim() || undefined);
      setMessage(`Envoyé à ${res.sentTo ?? email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  async function shareChat() {
    setBusy(true);
    setMessage(null);
    try {
      await shareReceiptInChat(referenceType, referenceId);
      setMessage("Reçu partagé dans le chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat indisponible");
    } finally {
      setBusy(false);
    }
  }

  const canChat = ["RIDE", "ERRAND", "DELIVERY", "RENTAL", "SCHEDULED"].includes(referenceType.toUpperCase());
  const docLabel = receipt?.documentType === "INVOICE" ? "Facture" : "Reçu";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#6C63FF]">← Retour</button>
      <h2 className="text-lg font-semibold">{docLabel} SENGA</h2>

      {loading && <p className="text-gray-500 py-8 text-center">Chargement…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {message && <p className="text-sm text-green-700 bg-green-50 rounded-xl p-3">{message}</p>}

      {receipt && (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <p className="text-xs text-[#6C63FF] font-semibold">SENGA RDC</p>
            <p className="font-mono text-sm">{receipt.receiptNumber}</p>
            <p className="text-sm text-gray-600">{receipt.serviceTypeLabel}</p>
            <p className="text-sm">{receipt.serviceLabel}</p>
            <div className="border-t pt-3 space-y-2">
              {receipt.lines.map((line, i) => (
                <div key={i} className="flex justify-between text-sm gap-4">
                  <span>{line.label}</span>
                  <span className={line.kind === "total" ? "font-semibold text-green-700" : ""}>
                    {line.kind === "discount" ? "−" : ""}
                    {formatCdf(Math.abs(line.amountCdf))}
                  </span>
                </div>
              ))}
            </div>
            {receipt.payment && (
              <p className="text-xs text-gray-500 pt-2">
                Paiement : {receipt.payment.methodLabel} ({receipt.payment.status})
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={downloadPdf}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
            >
              Télécharger PDF
            </button>
            {canChat && (
              <button
                type="button"
                disabled={busy}
                onClick={shareChat}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
              >
                Partager le reçu (API — chat mobile uniquement)
              </button>
            )}
          </div>

          <div className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={sendEmail}
              className="w-full py-2.5 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
            >
              Envoyer par e-mail
            </button>
          </div>
        </>
      )}
    </div>
  );
}
