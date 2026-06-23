CREATE TYPE "MovingVehicleCategory" AS ENUM ('CAMIONNETTE', 'CAMION_15M3', 'CAMION_30M3', 'CAMION_50M3');

ALTER TABLE "moving_requests" ADD COLUMN "vehicleCategory" "MovingVehicleCategory" NOT NULL DEFAULT 'CAMION_15M3';
