import assert from "node:assert/strict";
import {
  allocateDiscount, completeShipmentPayment, deriveShipmentStatus, normalizeThankYouData,
  PAYMENT_WINDOW_MS, shipmentOnlineDiscount, shipmentTotal, type ThankYouPart, type ThankYouPayload,
} from "../lib/thank-you-session";
import { computeScenario, scenarioFromOverride } from "../lib/split-engine";

const now = Date.parse("2026-09-03T12:00:00Z");
const part = (key: string, paymentMethod: ThankYouPart["paymentMethod"]): ThankYouPart => ({
  key, paymentMethod, sourceName: "Склад", methodLabel: "Курьер", leadTimeLabel: "Завтра",
  mode: "courier", freeDeliveryThreshold: 5000, items: [], subtotal: 2097, deliveryPrice: 299,
  promoDiscount: 100, bonusUsed: 110,
});
const raw: ThankYouPayload = {
  orderNumber: "GJ-TEST", orderedAtIso: new Date(now).toISOString(),
  parts: [part("card", "card"), part("sbp", "sbp"), part("receipt", "on_receipt")],
  total: 6558, payOnDeliveryOnly: false, method: "courier",
};
const order = normalizeThankYouData(raw, now);
assert.equal(deriveShipmentStatus("card"), "awaiting_payment");
assert.equal(deriveShipmentStatus("sbp"), "awaiting_payment");
assert.deepEqual(order.parts.map((p) => p.actionStatus), ["awaiting_payment", "awaiting_payment", "active"]);
assert.equal(new Set(order.parts.map((p) => p.orderNumber)).size, 3);
assert.equal(order.parts[0].paymentDeadlineIso, new Date(now + PAYMENT_WINDOW_MS).toISOString());
assert.equal(order.parts[2].paymentDeadlineIso, undefined);
assert.equal(order.parts.reduce((sum, p) => sum + shipmentTotal(p), 0), raw.total);

const paidFirst = completeShipmentPayment(order, "card", "card", now + 1000);
assert.deepEqual(paidFirst.parts.map((p) => p.actionStatus), ["paid_online", "awaiting_payment", "active"]);
assert.equal(paidFirst.parts[0].paidAmount, 2186);
assert.equal(paidFirst.parts[0].onlineDiscount, 0);
assert.deepEqual(completeShipmentPayment(paidFirst, "card", "sbp", now + 2000), paidFirst);

assert.equal(shipmentOnlineDiscount(order.parts[2]), 94); // 5% of 1887 goods; shipping excluded.
const paidReceipt = completeShipmentPayment(paidFirst, "receipt", "sbp", now + 3000);
assert.equal(paidReceipt.parts[2].paymentMethod, "sbp");
assert.equal(paidReceipt.parts[2].paidAmount, 2092);
assert.equal(paidReceipt.parts[2].onlineDiscount, 94);
assert.equal(paidReceipt.total, 6464);
assert.deepEqual(completeShipmentPayment(paidReceipt, "receipt", "card", now + 4000), paidReceipt);

const reopened = normalizeThankYouData(JSON.parse(JSON.stringify(paidFirst)), now + PAYMENT_WINDOW_MS);
assert.deepEqual(reopened.parts.map((p) => p.actionStatus), ["paid_online", "cancelled", "active"]);
assert.equal(reopened.parts[1].cancellationReason, "payment_expired");
assert.equal(reopened.parts[0].paymentDeadlineIso, order.parts[0].paymentDeadlineIso);
assert.equal(shipmentOnlineDiscount(reopened.parts[2]), 94);
assert.equal(completeShipmentPayment(order, "sbp", "sbp", now + PAYMENT_WINDOW_MS).parts[1].actionStatus, "cancelled");

const single = normalizeThankYouData({ ...raw, parts: [part("one", "on_receipt")] }, now);
assert.equal(single.parts[0].orderNumber, "GJ-TEST");
assert.equal(single.parts[0].actionStatus, "active");
const legacy = normalizeThankYouData({ ...raw, paymentMethod: "card", orderPromoDiscount: 3, orderBonusUsed: 7,
  parts: [part("a", undefined), part("b", undefined)].map((p) => ({ ...p, promoDiscount: 0, bonusUsed: 0 })),
}, now);
assert.equal(legacy.parts.reduce((s, p) => s + p.promoDiscount, 0), 3);
assert.equal(legacy.parts.reduce((s, p) => s + p.bonusUsed, 0), 7);
assert.equal(legacy.parts[0].actionStatus, "awaiting_payment");
assert.deepEqual(normalizeThankYouData(legacy, now + 2000), legacy);
assert.deepEqual(allocateDiscount(7, [1, 2, 10]), [1, 1, 5]);
assert.deepEqual(allocateDiscount(5, [0, 0]), [0, 0]);
assert.deepEqual(allocateDiscount(100, [2, 3]), [2, 3]);

const products = ["a", "b"].map((id) => ({ id, name: id, sku: id, price: 1000, image: "" }));
const sources = [{ id: "wh", name: "Склад", type: "warehouse", priority: 1 }, { id: "store", name: "Магазин", type: "store", priority: 2 }];
const cartLines = products.map((p) => ({ productId: p.id, quantity: 1 }));
const rule = { allowed: true, maxShipments: 2, storePickupHoldDays: 3, clickCollectHoldDays: 5, pvzHoldDays: 5,
  leadTimeDays: 1, leadTimeLabel: "Завтра", deliveryPrice: 299, freeDeliveryThreshold: 5000,
  canUseWarehouse: true, canUseStores: true, canUseClickCollect: true };
for (const deliveryMethodCode of ["courier", "pickup"] as const) {
  const scenario = computeScenario({ cartLines, deliveryMethodCode, cityHasClickCollect: true, selectedStoreId: "store", products, sources, rule,
    inventories: [{ productId: "a", sourceId: "wh" }, { productId: "b", sourceId: "store" }].map((i) => ({ ...i, quantity: 1,
      availableForCourier: true, availableForPickup: true, availableForPVZ: true })),
    disclaimers: { "common.payOnDeliveryOnly": "Только при получении", "pickup.payOnDeliveryOnlySplitPickup": "Только при получении" },
  });
  assert.equal(scenario.parts.length, 2);
  assert.equal(scenario.payOnDeliveryOnly, false);
  assert.ok(!scenario.informers.some((text) => /только.*при получении/i.test(text)));
}
assert.equal(scenarioFromOverride({ parts: [
  { key: "a", sourceId: "wh", mode: "courier", leadTimeLabel: "Завтра", items: [cartLines[0]] },
  { key: "b", sourceId: "store", mode: "courier", leadTimeLabel: "Завтра", items: [cartLines[1]] },
], remainder: [] }, products, rule, "courier").payOnDeliveryOnly, false);
console.log("Shipment payment checks passed: mixed methods, discount allocation, independent settlement, retries, expiry, reload, split scenarios.");
