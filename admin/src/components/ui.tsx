"use client";

import { useEffect } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
};

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[#1A1A2E]">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Fermer">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
};

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirmer", danger, loading }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Annuler</button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className={`px-4 py-2 rounded-xl text-sm text-white disabled:opacity-60 ${danger ? "bg-[#FF6B35]" : "bg-[#6C63FF]"}`}
        >
          {loading ? "En cours…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-center text-gray-400 py-12">{message}</p>;
}

export function LoadingState({ message = "Chargement…" }: { message?: string }) {
  return <p className="text-center text-gray-400 py-12">{message}</p>;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-center justify-between gap-4">
      <span className="text-sm">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-sm underline shrink-0">Réessayer</button>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-red-100 text-red-700",
  PENDING_KYC: "bg-yellow-100 text-yellow-700",
  OPEN: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-violet-100 text-violet-700",
  SEARCHING: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  DELIVERED: "bg-green-100 text-green-700",
  IN_TRANSIT: "bg-violet-100 text-violet-700",
  RESTAURANT_CONFIRMED: "bg-amber-100 text-amber-800",
  READY_FOR_PICKUP: "bg-blue-100 text-blue-700",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  PENDING_KYC: "KYC en attente",
  OPEN: "Ouvert",
  RESOLVED: "Résolu",
  PENDING: "En attente",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
  IN_PROGRESS: "En cours",
  SEARCHING: "Recherche",
  SCHEDULED: "Planifié",
  DELIVERED: "Livré",
  IN_TRANSIT: "En transit",
  RESTAURANT_CONFIRMED: "Restaurant OK",
  READY_FOR_PICKUP: "Prêt",
  ASSIGNED: "Assigné",
  SOS: "SOS",
};

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-400">—</span>;
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase();
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}>{label}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl shadow-sm ${className}`}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full max-w-sm rounded-xl border-0 bg-white p-3 shadow-sm text-sm"
      placeholder={placeholder ?? "Rechercher…"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function BtnPrimary({ children, onClick, disabled, className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60 ${className}`}>
      {children}
    </button>
  );
}

export function BtnSuccess({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-3 py-1.5 rounded-lg bg-[#00D4A1] text-white text-sm disabled:opacity-60">
      {children}
    </button>
  );
}

export function BtnDanger({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-3 py-1.5 rounded-lg bg-[#FF6B35] text-white text-sm disabled:opacity-60">
      {children}
    </button>
  );
}

export function BtnGhost({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-3 py-1.5 rounded-lg text-sm text-[#6C63FF] hover:bg-violet-50 disabled:opacity-60">
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-sm text-gray-600 mb-1">{children}</span>;
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
  disabled,
  inputMode,
  maxLength,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      className={`w-full rounded-xl border border-gray-200 p-3 text-sm disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete={autoComplete}
    />
  );
}

export function SelectInput({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <select className="w-full rounded-xl border border-gray-200 p-3 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}


export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-xs bg-[#FF6B35] text-white px-2 py-1 rounded-full">Hors ligne</span>;
}
