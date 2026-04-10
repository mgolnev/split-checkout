"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pruneInventoryOrphans } from "@/lib/inventory-maintenance";
import { prisma } from "@/lib/prisma";

async function gate() {
  const jar = await cookies();
  if (jar.get("admin_ok")?.value !== "1") redirect("/admin/login");
}

export async function createProduct(formData: FormData) {
  await gate();
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const image = String(formData.get("image") ?? "").trim() || "https://picsum.photos/seed/new/200/200";
  if (!name || !sku) return;
  await prisma.product.create({
    data: { name, sku, price: Math.round(price), image, isActive: true },
  });
  revalidatePath("/admin/products");
}

export async function createProductWithStocks(formData: FormData) {
  await gate();
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const image = String(formData.get("image") ?? "").trim() || "https://picsum.photos/seed/new/200/200";
  if (!name || !sku) return;

  const product = await prisma.product.create({
    data: { name, sku, price: Math.round(price), image, isActive: true },
  });

  const sources = await prisma.source.findMany({ where: { isActive: true } });
  for (const s of sources) {
    const qty = toInt(formData.get(`qty_${s.id}`), 0);
    await prisma.inventory.create({
      data: {
        productId: product.id,
        sourceId: s.id,
        quantity: Math.max(0, qty),
        // По умолчанию при создании товара включаем все способы поставки.
        availableForCourier: true,
        availableForPickup: true,
        availableForPVZ: true,
      },
    });
  }
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

export async function setOverrideEnabledForm(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  const isEnabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await prisma.scenarioOverride.update({
    where: { id },
    data: { isEnabled },
  });
  revalidatePath("/admin/overrides");
}

export async function toggleProductActive(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("next") ?? "") === "true";
  if (!id) return;
  await prisma.product.update({ where: { id }, data: { isActive: next } });
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

export async function saveProductStocks(formData: FormData) {
  await gate();
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;

  const sources = await prisma.source.findMany({ where: { isActive: true } });
  for (const s of sources) {
    const qty = Math.max(0, toInt(formData.get(`qty_${s.id}`), 0));
    await prisma.inventory.upsert({
      where: { productId_sourceId: { productId, sourceId: s.id } },
      create: {
        productId,
        sourceId: s.id,
        quantity: qty,
        availableForCourier: true,
        availableForPickup: true,
        availableForPVZ: true,
      },
      update: { quantity: qty },
    });
  }
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

export async function deleteProduct(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? formData.get("productId") ?? "");
  if (!id) return;
  await prisma.$transaction(async (tx) => {
    await tx.inventory.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
  await pruneInventoryOrphans();
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

const toBool = (v: FormDataEntryValue | null) =>
  String(v ?? "").toLowerCase() === "true" || String(v ?? "") === "on";
const toInt = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

/** Карточка товара (название, SKU, цена, картинка, активность) + остатки по всем источникам — одна форма. */
export async function saveProductFull(formData: FormData) {
  await gate();
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const imageRaw = String(formData.get("image") ?? "").trim();
  const isActive = toBool(formData.get("isActive"));

  if (!name || !sku || !Number.isFinite(price)) return;

  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) return;

  if (sku !== existing.sku) {
    const taken = await prisma.product.findUnique({ where: { sku } });
    if (taken) return;
  }

  const priceInt = Math.round(price);
  const image = imageRaw || existing.image;

  await prisma.product.update({
    where: { id: productId },
    data: { name, sku, price: priceInt, image, isActive },
  });

  const sources = await prisma.source.findMany({ where: { isActive: true } });
  for (const s of sources) {
    const qty = Math.max(0, toInt(formData.get(`qty_${s.id}`), 0));
    await prisma.inventory.upsert({
      where: { productId_sourceId: { productId, sourceId: s.id } },
      create: {
        productId,
        sourceId: s.id,
        quantity: qty,
        availableForCourier: true,
        availableForPickup: true,
        availableForPVZ: true,
      },
      update: { quantity: qty },
    });
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

export async function createDeliveryMethod(formData: FormData) {
  await gate();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return;
  await prisma.deliveryMethod.create({
    data: { code, name, isActive: true },
  });
  revalidatePath("/admin/delivery-methods");
}

export async function updateDeliveryMethod(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.deliveryMethod.update({
    where: { id },
    data: {
      code: String(formData.get("code") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      isActive: toBool(formData.get("isActive")),
    },
  });
  revalidatePath("/admin/delivery-methods");
}

export async function deleteDeliveryMethod(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.deliveryMethod.delete({ where: { id } });
  revalidatePath("/admin/delivery-methods");
}

export async function createCity(formData: FormData) {
  await gate();
  const name = String(formData.get("name") ?? "").trim();
  const regionType = String(formData.get("regionType") ?? "").trim();
  if (!name || !regionType) return;
  await prisma.city.create({
    data: {
      name,
      regionType,
      hasClickCollect: toBool(formData.get("hasClickCollect")),
    },
  });
  revalidatePath("/admin/cities");
}

export async function updateCity(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.city.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      regionType: String(formData.get("regionType") ?? "").trim(),
      hasClickCollect: toBool(formData.get("hasClickCollect")),
    },
  });
  revalidatePath("/admin/cities");
}

export async function deleteCity(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.city.delete({ where: { id } });
  revalidatePath("/admin/cities");
}

export async function createSource(formData: FormData) {
  await gate();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const cityId = String(formData.get("cityId") ?? "");
  if (!name || !cityId || !type) return;
  await prisma.source.create({
    data: {
      name,
      type,
      cityId,
      priority: toInt(formData.get("priority"), 0),
      isActive: toBool(formData.get("isActive")),
    },
  });
  revalidatePath("/admin/sources");
}

export async function updateSource(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.source.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      type: String(formData.get("type") ?? "").trim(),
      cityId: String(formData.get("cityId") ?? ""),
      priority: toInt(formData.get("priority"), 0),
      isActive: toBool(formData.get("isActive")),
    },
  });
  revalidatePath("/admin/sources");
}

export async function deleteSource(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.source.delete({ where: { id } });
  revalidatePath("/admin/sources");
}

export async function upsertInventory(formData: FormData) {
  await gate();
  const productId = String(formData.get("productId") ?? "");
  const sourceId = String(formData.get("sourceId") ?? "");
  if (!productId || !sourceId) return;
  await prisma.inventory.upsert({
    where: { productId_sourceId: { productId, sourceId } },
    create: {
      productId,
      sourceId,
      quantity: toInt(formData.get("quantity"), 0),
      availableForCourier: toBool(formData.get("availableForCourier")),
      availableForPickup: toBool(formData.get("availableForPickup")),
      availableForPVZ: toBool(formData.get("availableForPVZ")),
    },
    update: {
      quantity: toInt(formData.get("quantity"), 0),
      availableForCourier: toBool(formData.get("availableForCourier")),
      availableForPickup: toBool(formData.get("availableForPickup")),
      availableForPVZ: toBool(formData.get("availableForPVZ")),
    },
  });
  revalidatePath("/admin/inventory");
}

export async function deleteInventory(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.inventory.delete({ where: { id } });
  revalidatePath("/admin/inventory");
}

export async function deleteInventoryById(id: string) {
  await gate();
  if (!id) return;
  await prisma.inventory.delete({ where: { id } });
  revalidatePath("/admin/inventory");
}

export async function createRule(formData: FormData) {
  await gate();
  const cityId = String(formData.get("cityId") ?? "");
  const deliveryMethodId = String(formData.get("deliveryMethodId") ?? "");
  if (!cityId || !deliveryMethodId) return;
  const created = await prisma.shippingRule.create({
    data: {
      cityId,
      deliveryMethodId,
      allowed: toBool(formData.get("allowed")),
      maxShipments: Math.max(1, toInt(formData.get("maxShipments"), 2)),
      storePickupHoldDays: Math.max(1, toInt(formData.get("storePickupHoldDays"), 3)),
      clickCollectHoldDays: Math.max(1, toInt(formData.get("clickCollectHoldDays"), 8)),
      pvzHoldDays: Math.max(1, toInt(formData.get("pvzHoldDays"), 5)),
      leadTimeDays: toInt(formData.get("leadTimeDays"), 1),
      leadTimeLabel: String(formData.get("leadTimeLabel") ?? "").trim(),
      requiresPrepayment: toBool(formData.get("requiresPrepayment")),
      freeDeliveryThreshold: toInt(formData.get("freeDeliveryThreshold"), 0),
      deliveryPrice: toInt(formData.get("deliveryPrice"), 0),
      canUseWarehouse: toBool(formData.get("canUseWarehouse")),
      canUseStores: toBool(formData.get("canUseStores")),
      canUseClickCollect: toBool(formData.get("canUseClickCollect")),
    },
  });
  const method = await prisma.deliveryMethod.findUnique({ where: { id: deliveryMethodId } });
  if (method?.code === "courier") {
    await prisma.ruleStep.createMany({
      data: [
        {
          shippingRuleId: created.id,
          sortOrder: 10,
          sourceType: "warehouse",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
        {
          shippingRuleId: created.id,
          sortOrder: 20,
          sourceType: "store",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
        {
          shippingRuleId: created.id,
          sortOrder: 30,
          sourceType: "warehouse",
          matchMode: "threshold",
          thresholdPercent: 40,
          continueAfterMatch: true,
        },
        {
          shippingRuleId: created.id,
          sortOrder: 40,
          sourceType: "store",
          matchMode: "full",
          thresholdPercent: 100,
          continueAfterMatch: false,
        },
      ],
    });
  }
  revalidatePath("/admin/rules");
}

export async function updateRule(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.shippingRule.update({
    where: { id },
    data: {
      allowed: toBool(formData.get("allowed")),
      maxShipments: Math.max(1, toInt(formData.get("maxShipments"), 2)),
      storePickupHoldDays: Math.max(1, toInt(formData.get("storePickupHoldDays"), 3)),
      clickCollectHoldDays: Math.max(1, toInt(formData.get("clickCollectHoldDays"), 8)),
      pvzHoldDays: Math.max(1, toInt(formData.get("pvzHoldDays"), 5)),
      leadTimeDays: toInt(formData.get("leadTimeDays"), 1),
      leadTimeLabel: String(formData.get("leadTimeLabel") ?? "").trim(),
      requiresPrepayment: toBool(formData.get("requiresPrepayment")),
      freeDeliveryThreshold: toInt(formData.get("freeDeliveryThreshold"), 0),
      deliveryPrice: toInt(formData.get("deliveryPrice"), 0),
      canUseWarehouse: toBool(formData.get("canUseWarehouse")),
      canUseStores: toBool(formData.get("canUseStores")),
      canUseClickCollect: toBool(formData.get("canUseClickCollect")),
    },
  });
  revalidatePath("/admin/rules");
}

export async function deleteRule(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.shippingRule.delete({ where: { id } });
  revalidatePath("/admin/rules");
}

export async function createRuleStep(formData: FormData) {
  await gate();
  const shippingRuleId = String(formData.get("shippingRuleId") ?? "");
  if (!shippingRuleId) return;
  const matchMode = String(formData.get("matchMode") ?? "full");
  await prisma.ruleStep.create({
    data: {
      shippingRuleId,
      sortOrder: toInt(formData.get("sortOrder"), 10),
      sourceType: String(formData.get("sourceType") ?? "warehouse"),
      matchMode,
      thresholdPercent: matchMode === "full" ? 100 : toInt(formData.get("thresholdPercent"), 100),
      continueAfterMatch: toBool(formData.get("continueAfterMatch")),
    },
  });
  revalidatePath("/admin/rules");
}

export async function updateRuleStep(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const matchMode = String(formData.get("matchMode") ?? "full");
  await prisma.ruleStep.update({
    where: { id },
    data: {
      sortOrder: toInt(formData.get("sortOrder"), 10),
      sourceType: String(formData.get("sourceType") ?? "warehouse"),
      matchMode,
      thresholdPercent: matchMode === "full" ? 100 : toInt(formData.get("thresholdPercent"), 100),
      continueAfterMatch: toBool(formData.get("continueAfterMatch")),
    },
  });
  revalidatePath("/admin/rules");
}

export async function deleteRuleStep(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.ruleStep.delete({ where: { id } });
  revalidatePath("/admin/rules");
}

export async function createDisclaimer(formData: FormData) {
  await gate();
  const code = String(formData.get("code") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!code || !title || !text) return;
  await prisma.disclaimerTemplate.create({
    data: {
      code,
      title,
      text,
      isActive: toBool(formData.get("isActive")),
    },
  });
  revalidatePath("/admin/disclaimers");
  revalidatePath("/checkout");
}

export async function updateDisclaimer(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.disclaimerTemplate.update({
    where: { id },
    data: {
      code: String(formData.get("code") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim(),
      text: String(formData.get("text") ?? "").trim(),
      isActive: toBool(formData.get("isActive")),
    },
  });
  revalidatePath("/admin/disclaimers");
  revalidatePath("/checkout");
}

export async function deleteDisclaimer(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.disclaimerTemplate.delete({ where: { id } });
  revalidatePath("/admin/disclaimers");
  revalidatePath("/checkout");
}

export async function createOverride(formData: FormData) {
  await gate();
  const name = String(formData.get("name") ?? "").trim();
  const cityId = String(formData.get("cityId") ?? "");
  const deliveryMethod = String(formData.get("deliveryMethod") ?? "");
  const payloadJson = String(formData.get("payloadJson") ?? "{}");
  if (!name || !cityId || !deliveryMethod) return;
  JSON.parse(payloadJson);
  await prisma.scenarioOverride.create({
    data: {
      name,
      cityId,
      deliveryMethod,
      isEnabled: toBool(formData.get("isEnabled")),
      payloadJson,
    },
  });
  revalidatePath("/admin/overrides");
}

export async function updateOverride(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const payloadJson = String(formData.get("payloadJson") ?? "{}");
  JSON.parse(payloadJson);
  await prisma.scenarioOverride.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      isEnabled: toBool(formData.get("isEnabled")),
      payloadJson,
    },
  });
  revalidatePath("/admin/overrides");
}

export async function deleteOverride(formData: FormData) {
  await gate();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.scenarioOverride.delete({ where: { id } });
  revalidatePath("/admin/overrides");
}
