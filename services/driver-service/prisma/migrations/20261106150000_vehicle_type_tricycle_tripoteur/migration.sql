-- Tricycle (passagers) et tripoteur (marchandises). Additive: existing rows are untouched.
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'TRICYCLE';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'TRIPOTEUR';
