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

## Message à envoyer à SerdiPay

> Bonjour,  
> Nos OTP SMS partent via `API2N4XMR7` → DreamDigital.  
> DreamDigital répond `Message Submitted` (ex. message_id `2026102008301054300`) pour `243893515173`, mais le SMS n’arrive sur aucun opérateur CD (Orange, Airtel, Vodacom).  
> Avec `+243…` nous avions `Invalid Destination Address`.  
> Merci de vérifier le routage A2P RDC + DLR, et de confirmer le sender ID approuvé pour Orange/Airtel/Vodacom.  
> IP sortante : `178.104.82.66` (`sms.afri-soft.com`).

## Contournement SENGA

- Tant que le routage CD n’est pas corrigé : basculer le hub sur Africa’s Talking (`SMS_PROVIDER=africastalking` + username/clé/sender live) dès que les credentials sont disponibles.
