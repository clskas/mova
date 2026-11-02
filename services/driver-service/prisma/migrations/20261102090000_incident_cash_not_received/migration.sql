-- Litige distinct : espèces non reçues (pas un SOS).
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'CASH_NOT_RECEIVED';
