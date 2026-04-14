-- AlterTable
ALTER TABLE "ShippingRule" ADD COLUMN "pvzDeliveryMinDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "ShippingRule" ADD COLUMN "pvzDeliveryMaxDays" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ShippingRule" ADD COLUMN "pvzReadyFixedAt" DATE;
