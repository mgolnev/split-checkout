import type { PrismaClient } from "@prisma/client";
import { defaultDisclaimerRows } from "../lib/disclaimers";

/** Локальный плейсхолдер — не зависит от внешних CDN */
const IMG = () => "/product-placeholder.svg";

/** Встроенный демо-набор (используется, если нет `prisma/seed-snapshot.json`). */
export async function runBuiltinDemoSeed(prisma: PrismaClient): Promise<void> {
  const dmCourier = await prisma.deliveryMethod.create({
    data: { id: "dm_courier", code: "courier", name: "Курьер", isActive: true },
  });
  const dmPickup = await prisma.deliveryMethod.create({
    data: { id: "dm_pickup", code: "pickup", name: "Самовывоз из магазина", isActive: true },
  });
  const dmPvz = await prisma.deliveryMethod.create({
    data: { id: "dm_pvz", code: "pvz", name: "ПВЗ", isActive: true },
  });

  const msk = await prisma.city.create({
    data: {
      id: "city_msk",
      name: "Москва",
      regionType: "central",
      hasClickCollect: true,
    },
  });

  const whPod = await prisma.source.create({
    data: {
      id: "src_wh_pod",
      name: "Склад Подольск",
      type: "warehouse",
      cityId: msk.id,
      priority: 1,
    },
  });
  const stTver = await prisma.source.create({
    data: {
      id: "src_st_tver",
      name: "Магазин Тверская",
      type: "store",
      cityId: msk.id,
      priority: 10,
    },
  });
  const stMit = await prisma.source.create({
    data: {
      id: "src_st_mit",
      name: "Магазин Митино",
      type: "store",
      cityId: msk.id,
      priority: 11,
    },
  });

  await prisma.$transaction([
    prisma.product.create({
      data: {
        id: "p_futbolka",
        name: "Футболка базовая",
        sku: "TSH-001",
        price: 999,
        image: IMG(),
        sizeLabel: "M",
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        id: "p_jeans",
        name: "Джинсы slim",
        sku: "JNS-002",
        price: 3499,
        image: IMG(),
        sizeLabel: "32",
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        id: "p_kurtka",
        name: "Куртка демисезон",
        sku: "JKT-003",
        price: 5999,
        image: IMG(),
        sizeLabel: "L",
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        id: "p_kross",
        name: "Кроссовки",
        sku: "SNK-004",
        price: 4299,
        image: IMG(),
        sizeLabel: "42",
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        id: "p_plate",
        name: "Платье",
        sku: "DRS-005",
        price: 2799,
        image: IMG(),
        sizeLabel: "S",
        isActive: true,
      },
    }),
  ]);

  const inv = (
    productId: string,
    sourceId: string,
    qty: number,
    c = true,
    p = true,
    z = true,
  ) => ({
    productId,
    sourceId,
    quantity: qty,
    availableForCourier: c,
    availableForPickup: p,
    availableForPVZ: z,
  });

  await prisma.inventory.createMany({
    data: [
      inv("p_futbolka", whPod.id, 0),
      inv("p_jeans", whPod.id, 0),
      inv("p_kurtka", whPod.id, 25),
      inv("p_kross", whPod.id, 15),
      inv("p_plate", whPod.id, 0),
      inv("p_futbolka", stTver.id, 20),
      inv("p_jeans", stTver.id, 20),
      inv("p_kurtka", stTver.id, 0),
      inv("p_kross", stTver.id, 0, true, true, false),
      inv("p_plate", stTver.id, 10),
      inv("p_futbolka", stMit.id, 0),
      inv("p_jeans", stMit.id, 0),
      inv("p_kurtka", stMit.id, 3),
      inv("p_kross", stMit.id, 10, true, true, false),
      inv("p_plate", stMit.id, 8),
    ],
  });

  await prisma.shippingRule.createMany({
    data: [
      {
        cityId: msk.id,
        deliveryMethodId: dmCourier.id,
        allowed: true,
        maxShipments: 2,
        storePickupHoldDays: 3,
        clickCollectHoldDays: 8,
        pvzHoldDays: 5,
        leadTimeDays: 1,
        leadTimeLabel: "Завтра, 15:00–18:00",
        requiresPrepayment: false,
        freeDeliveryThreshold: 1500,
        deliveryPrice: 299,
        canUseWarehouse: true,
        canUseStores: true,
        canUseClickCollect: true,
      },
      {
        cityId: msk.id,
        deliveryMethodId: dmPickup.id,
        allowed: true,
        maxShipments: 2,
        storePickupHoldDays: 3,
        clickCollectHoldDays: 8,
        pvzHoldDays: 5,
        leadTimeDays: 0,
        leadTimeLabel: "Самовывоз",
        requiresPrepayment: false,
        freeDeliveryThreshold: 0,
        deliveryPrice: 0,
        canUseWarehouse: true,
        canUseStores: true,
        canUseClickCollect: true,
      },
      {
        cityId: msk.id,
        deliveryMethodId: dmPvz.id,
        allowed: true,
        maxShipments: 2,
        storePickupHoldDays: 3,
        clickCollectHoldDays: 8,
        pvzHoldDays: 5,
        leadTimeDays: 3,
        leadTimeLabel: "3–5 дней",
        requiresPrepayment: false,
        freeDeliveryThreshold: 0,
        deliveryPrice: 299,
        canUseWarehouse: true,
        canUseStores: false,
        canUseClickCollect: false,
      },
    ],
  });

  const courierRule = await prisma.shippingRule.findFirst({
    where: { cityId: msk.id, deliveryMethodId: dmCourier.id },
  });
  if (courierRule) {
    await prisma.ruleStep.createMany({
      data: [
        {
          shippingRuleId: courierRule.id,
          sortOrder: 10,
          sourceType: "warehouse",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
        {
          shippingRuleId: courierRule.id,
          sortOrder: 20,
          sourceType: "store",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
        {
          shippingRuleId: courierRule.id,
          sortOrder: 30,
          sourceType: "warehouse",
          matchMode: "threshold",
          thresholdPercent: 40,
          continueAfterMatch: true,
        },
        {
          shippingRuleId: courierRule.id,
          sortOrder: 40,
          sourceType: "store",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
        {
          shippingRuleId: courierRule.id,
          sortOrder: 50,
          sourceType: "store",
          matchMode: "threshold",
          thresholdPercent: 40,
          continueAfterMatch: true,
        },
      ],
    });
  }

  await prisma.pvzPoint.createMany({
    data: [
      {
        name: "ПВЗ 5Post, Тверская",
        address: "г. Москва, ул. Тверская, 10",
        cityId: msk.id,
        requiresPrepayment: false,
      },
      {
        name: "ПВЗ Почта России",
        address: "г. Москва, ул. Большая Полянка, 3",
        cityId: msk.id,
        requiresPrepayment: true,
      },
      {
        name: "ПВЗ Boxberry",
        address: "г. Москва, Садовая-Кудринская, 15",
        cityId: msk.id,
        requiresPrepayment: false,
      },
    ],
  });

  await prisma.disclaimerTemplate.createMany({
    data: defaultDisclaimerRows().map((row) => ({
      code: row.code,
      title: row.title,
      text: row.text,
      isActive: true,
    })),
  });

  await prisma.scenarioOverride.create({
    data: {
      name: "Демо: 3+2 курьером",
      cityId: msk.id,
      deliveryMethod: "courier",
      isEnabled: false,
      payloadJson: JSON.stringify({
        parts: [
          {
            key: "o1",
            sourceId: whPod.id,
            mode: "courier",
            leadTimeLabel: "Завтра со склада",
            items: [
              { productId: "p_kurtka", quantity: 1 },
              { productId: "p_kross", quantity: 1 },
            ],
            defaultIncluded: true,
            canToggle: true,
          },
          {
            key: "o2",
            sourceId: stTver.id,
            mode: "courier",
            leadTimeLabel: "Послезавтра из магазина",
            items: [
              { productId: "p_futbolka", quantity: 1 },
              { productId: "p_jeans", quantity: 1 },
            ],
            defaultIncluded: true,
            canToggle: true,
          },
        ],
        remainder: [],
        informers: ["Ручной override включён для демонстрации конкретного split."],
      }),
    },
  });
}
