-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionType" TEXT NOT NULL,
    "hasClickCollect" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "availableForCourier" BOOLEAN NOT NULL DEFAULT true,
    "availableForPickup" BOOLEAN NOT NULL DEFAULT true,
    "availableForPVZ" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliveryMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRule" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "deliveryMethodId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "maxShipments" INTEGER NOT NULL DEFAULT 2,
    "storePickupHoldDays" INTEGER NOT NULL DEFAULT 3,
    "clickCollectHoldDays" INTEGER NOT NULL DEFAULT 8,
    "pvzHoldDays" INTEGER NOT NULL DEFAULT 5,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "leadTimeLabel" TEXT NOT NULL DEFAULT '',
    "requiresPrepayment" BOOLEAN NOT NULL DEFAULT false,
    "freeDeliveryThreshold" INTEGER NOT NULL DEFAULT 0,
    "deliveryPrice" INTEGER NOT NULL DEFAULT 0,
    "canUseWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "canUseStores" BOOLEAN NOT NULL DEFAULT true,
    "canUseClickCollect" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleStep" (
    "id" TEXT NOT NULL,
    "shippingRuleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 10,
    "sourceType" TEXT NOT NULL DEFAULT 'warehouse',
    "matchMode" TEXT NOT NULL DEFAULT 'full',
    "thresholdPercent" INTEGER NOT NULL DEFAULT 100,
    "continueAfterMatch" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RuleStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioOverride" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "deliveryMethod" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payloadJson" TEXT NOT NULL,

    CONSTRAINT "ScenarioOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PvzPoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "requiresPrepayment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PvzPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclaimerTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DisclaimerTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_productId_sourceId_key" ON "Inventory"("productId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMethod_code_key" ON "DeliveryMethod"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRule_cityId_deliveryMethodId_key" ON "ShippingRule"("cityId", "deliveryMethodId");

-- CreateIndex
CREATE INDEX "RuleStep_shippingRuleId_sortOrder_idx" ON "RuleStep"("shippingRuleId", "sortOrder");

-- CreateIndex
CREATE INDEX "ScenarioOverride_cityId_deliveryMethod_idx" ON "ScenarioOverride"("cityId", "deliveryMethod");

-- CreateIndex
CREATE UNIQUE INDEX "DisclaimerTemplate_code_key" ON "DisclaimerTemplate"("code");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRule" ADD CONSTRAINT "ShippingRule_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRule" ADD CONSTRAINT "ShippingRule_deliveryMethodId_fkey" FOREIGN KEY ("deliveryMethodId") REFERENCES "DeliveryMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleStep" ADD CONSTRAINT "RuleStep_shippingRuleId_fkey" FOREIGN KEY ("shippingRuleId") REFERENCES "ShippingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioOverride" ADD CONSTRAINT "ScenarioOverride_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvzPoint" ADD CONSTRAINT "PvzPoint_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
