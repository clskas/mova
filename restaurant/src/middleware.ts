import { NextRequest, NextResponse } from "next/server";

/** Canonical commerce partner portal (resto, pharma, supermarché, boutique). */
export const SENGA_PARTNER_HOST = "sengapartner.afri-soft.com";

/** Legacy host — keep until DNS/bookmarks migrate; redirect 301 → canonical. */
const LEGACY_HOSTS = new Set(["restaurant.afri-soft.com", "www.restaurant.afri-soft.com"]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!LEGACY_HOSTS.has(host)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = SENGA_PARTNER_HOST;
  url.port = "";
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|sw\\.js|manifest\\.webmanifest).*)"],
};
