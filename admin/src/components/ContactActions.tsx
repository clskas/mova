"use client";

type ContactActionsProps = {
  phone?: string | null;
  name?: string | null;
  compact?: boolean;
};

function normalizeTel(phone: string) {
  return phone.replace(/\s/g, "");
}

function whatsAppHref(phone: string) {
  const digits = normalizeTel(phone).replace(/^\+/, "");
  return `https://wa.me/${digits}`;
}

export function ContactActions({ phone, name, compact }: ContactActionsProps) {
  if (!phone?.trim()) {
    return <span className="text-gray-400 text-xs">Téléphone indisponible</span>;
  }
  const tel = normalizeTel(phone);
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "space-y-2"}>
      {!compact && name && (
        <p className="text-sm text-gray-700">
          {name} · <span className="font-mono">{phone}</span>
        </p>
      )}
      {!compact && !name && <p className="text-sm font-mono text-gray-700">{phone}</p>}
      <div className="flex flex-wrap gap-2">
        <a
          href={`tel:${tel}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-800 text-xs font-medium border border-green-200 hover:bg-green-100"
        >
          Appeler
        </a>
        <a
          href={whatsAppHref(phone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200 hover:bg-emerald-100"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}

export function ContactBlock({
  title,
  phone,
  name,
}: {
  title: string;
  phone?: string | null;
  name?: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ContactActions phone={phone} name={name} />
    </div>
  );
}
