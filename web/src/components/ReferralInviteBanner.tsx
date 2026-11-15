"use client";

import { useEffect, useState } from "react";
import { IOS_DRIVER, IOS_PASSENGER, captureReferralFromUrl, playStoreLink } from "@/lib/referral";

/** Shown when the page is opened from an invitation link (?ref=CODE). */
export function ReferralInviteBanner() {
  const [invite, setInvite] = useState<{ code: string; driver: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInvite(captureReferralFromUrl());
  }, []);

  if (!invite) return null;

  async function copyThenOpen(url: string) {
    try {
      await navigator.clipboard.writeText(invite!.code);
      setCopied(true);
    } catch {
      /* clipboard refused: the code stays visible */
    }
    window.location.href = url;
  }

  return (
    <div data-testid="referral-invite" className="mb-4 rounded-2xl bg-violet-50 p-4 text-center">
      <p className="font-semibold text-[#2D1B69]">Un proche vous invite sur SENGA{invite.driver ? " Driver" : ""}</p>
      <p className="mt-1 text-sm text-gray-600">
        Votre code de parrainage : <span className="font-mono font-bold tracking-wider">{invite.code}</span>
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Vous recevez un crédit après votre première course. Le code est déjà rempli{invite.driver ? " dans l’app Android" : " ci-dessous et dans l’app Android"}.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <a className="rounded-xl bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white" href={playStoreLink(invite.code, invite.driver)}>
          Installer sur Android
        </a>
        <button
          type="button"
          className="rounded-xl border border-[#6C47FF] px-4 py-2 text-sm font-semibold text-[#6C47FF]"
          onClick={() => void copyThenOpen(invite.driver ? IOS_DRIVER : IOS_PASSENGER)}
        >
          Installer sur iPhone
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {copied ? "Code copié : collez-le à l’inscription dans l’app." : "Sur iPhone, saisissez le code à l’inscription."}
      </p>
    </div>
  );
}
