# Incident SMS OTP — SerdiPay / DreamDigital (CD)

**Date :** 2026-10-20  
**Symptôme :** l’API SENGA / hub renvoie « SMS envoyé », le téléphone (Orange / Airtel / Vodacom) ne reçoit rien.

## Chaîne

`mova-auth` → `sms.afri-soft.com` → SerdiPay `apis.serdipay.com` → DreamDigital `papi.dream-digital.info`

## Faits techniques

1. Numéro en `+243…` → DreamDigital `status:F` / `Invalid Destination Address` (SerdiPay HTTP 200 quand même).
2. Numéro en `243…` ou `0…` → DreamDigital `status:S` / `Message Submitted` + `message_id`.
3. Aucun DLR accessible (`/api/sms-api/v1/status` 404 ; endpoints DreamDigital report 404).
4. Africa’s Talking non configuré sur le hub (`AFRICAS_TALKING_USERNAME` / `API_KEY` vides).

## Exemples `message_id` DreamDigital (non livrés côté utilisateur)

- `2026102008275659700` (243 + sender SerdiPay)
- `2026102008301054300`
- `2026102008313174700` … `2026102008314114600` (senders SerdiPay / AfrisoftS / DreamDigital / SENGA / 8899)

Téléphone test : `243893515173` (Orange).

## Message à coller à SerdiPay (WhatsApp / mail)

> Bonjour,  
> Votre API renvoie bien « SMS sent successfully » (HTTP 200). Ce n’est **pas** le point en litige.  
>  
> Dans le champ `data.response` de **votre** réponse, DreamDigital dit autre chose :  
> - `phone=243893515173` + sender `Wekka` → `status: S`, `remarks: Message Submitted`, `message_id: 2026102008434487300`  
> - `phone=+243893515173` → `status: F`, `remarks: Invalid Destination Address` (alors que vous renvoyez quand même HTTP 200)  
>  
> **Submitted ≠ Delivered.** Le téléphone Orange `+243893515173` (et Airtel/Vodacom testés) ne reçoit rien.  
> Merci de nous fournir le **DLR Delivered** (pas Submitted) pour `message_id 2026102008434487300`, et le sender ID réellement approuvé RDC (Orange / Airtel / Vodacom).  
> Compte SMS : `API2N4XMR7` · IP : `178.104.82.66` · `sms.afri-soft.com`.

## Contournement SENGA

- Tant que le routage CD n’est pas corrigé : basculer le hub sur Africa’s Talking (`SMS_PROVIDER=africastalking` + username/clé/sender live) dès que les credentials sont disponibles.
