# Afri-Soft outbound email (Cloudflare DNS)

Gmail PIN mail failed in production even after SMTP 250. `noreply@afri-soft.com`
bounces showed site4now MessageAI (`550 … marked as spam`) **before** Gmail.
`afri-soft.com` also publishes **DMARC `p=reject` without DKIM**, which Gmail can
drop silently. Nameservers are Cloudflare (`boyd` / `ophelia.ns.cloudflare.com`) —
add records **there**, not in the SmarterASP DNS panel.

## Already live (keep)

| Type | Name | Value |
| --- | --- | --- |
| TXT | `@` | `v=spf1 a mx include:_spf.site4now.net -all` |
| TXT | `_dmarc` | `v=DMARC1; p=reject; pct=100; rua=mailto:postmaster@afri-soft.com` |
| MX | `@` | `igw13.site4now.net` priority 10 |
| CNAME | `mail` | `mail5013.site4now.net` (DNS only, grey cloud) |

## Founder must add: DKIM

The public key is generated in SmarterMail. It cannot be invented in git.

1. Open https://mail5013.site4now.net
2. Sign in as **`postmaster@afri-soft.com`** (domain admin, not `noreply@`)
3. **Domain Settings → General → Enable DKIM**
   ([SmarterASP KB 2225](https://www.smarterasp.net/support/kb/a2225/set-up-dkim-record-with-our-new-email-system.aspx))
4. Copy **TXT Record Name** and **TXT Record Value**
5. Cloudflare → DNS → Add record, proxy **DNS only**:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `<selector>._domainkey` | `v=DKIM1; k=rsa; p=<full public key from SmarterMail>` |

Example name (selector is unique per generate): `8de4a792251aa92._domainkey`

Wait for DNS (often minutes). Send a test to Gmail and check headers:
`dkim=pass`, `spf=pass`, `dmarc=pass`.

## Optional until DKIM is live

If Gmail still drops after the content rewrite, temporarily relax DMARC:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_dmarc` | `v=DMARC1; p=none; pct=100; rua=mailto:postmaster@afri-soft.com` |

Restore `p=reject` once DKIM passes.

## Code fallback (Render `mova-auth`)

If `RESEND_API_KEY` is set, PIN mail uses Resend (Gmail-capable). Also set
`RESEND_FROM=noreply@afri-soft.com` after verifying the domain in Resend
(Resend will give its own DKIM CNAMEs — add those in Cloudflare too).

Without Resend, SMTP to Gmail is still attempted but admin **does not** claim
the PIN was emailed. Copy the PIN from the admin screen.
