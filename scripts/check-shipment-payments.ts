import assert from "node:assert/strict";
import {
  allocateDiscount, cancelOrder, completeOrderPayment, deriveShipmentStatus, failOrderPayment, normalizeThankYouData,
  orderOnlineDiscount, PAYMENT_WINDOW_MS, shipmentOnlineDiscount, shipmentTotal, type ThankYouPart, type ThankYouPayload,
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
assert.equal(order.orderPaymentStatus, "awaiting_payment");
assert.deepEqual(order.parts.map((p) => p.actionStatus), ["awaiting_payment", "awaiting_payment", "awaiting_payment"]);
assert.equal(new Set(order.parts.map((p) => p.orderNumber)).size, 3);
assert.equal(order.parts[0].paymentDeadlineIso, new Date(now + PAYMENT_WINDOW_MS).toISOString());
assert.equal(order.parts[2].paymentDeadlineIso, order.parts[0].paymentDeadlineIso);
assert.equal(order.parts.reduce((sum, p) => sum + shipmentTotal(p), 0), raw.total);

const failed = failOrderPayment(order, now + 1000);
assert.equal(failed.orderPaymentStatus, "payment_failed");
assert.deepEqual(failed.parts.map((p) => p.actionStatus), ["payment_failed", "payment_failed", "payment_failed"]);
assert.deepEqual(completeOrderPayment(failed, "card", now + 2000).parts.map((p) => p.actionStatus), ["paid_online", "paid_online", "paid_online"]);
assert.equal(completeOrderPayment(order, "sbp", now + 1000).total, raw.total);

const receiptOrder = normalizeThankYouData({
  ...raw, paymentMethod: "on_receipt", parts: raw.parts.map((p) => ({ ...p, paymentMethod: "on_receipt" })),
}, now);
assert.equal(receiptOrder.orderPaymentStatus, "active");
assert.equal(shipmentOnlineDiscount(receiptOrder.parts[2]), 94); // 5% of 1887 goods; shipping excluded.
assert.equal(orderOnlineDiscount(receiptOrder.parts), 283);
const paidReceipt = completeOrderPayment(receiptOrder, "sbp", now + 3000);
assert.deepEqual(paidReceipt.parts.map((p) => p.actionStatus), ["paid_online", "paid_online", "paid_online"]);
assert.equal(paidReceipt.total, 6275);
assert.equal(paidReceipt.orderPaidAmount, 6275);

const reopened = normalizeThankYouData(JSON.parse(JSON.stringify(order)), now + PAYMENT_WINDOW_MS);
assert.equal(reopened.orderPaymentStatus, "cancelled");
assert.deepEqual(reopened.parts.map((p) => p.actionStatus), ["cancelled", "cancelled", "cancelled"]);
assert.equal(reopened.parts[1].cancellationReason, "payment_expired");
assert.equal(completeOrderPayment(reopened, "sbp", now + PAYMENT_WINDOW_MS).orderPaymentStatus, "cancelled");
assert.equal(cancelOrder(order).parts.every((p) => p.actionStatus === "cancelled"), true);

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
const isolatedOverride = scenarioFromOverride({ parts: [
  { key: "courier", sourceId: "wh", mode: "courier", leadTimeLabel: "Завтра", items: [cartLines[0]] },
  { key: "pvz", sourceId: "wh", mode: "pvz", leadTimeLabel: "Послезавтра", items: [cartLines[1]] },
], remainder: [] }, products, rule, "courier");
assert.deepEqual(isolatedOverride.parts.map((p) => p.mode), ["courier"]);
assert.deepEqual(isolatedOverride.remainder, [cartLines[1]]);
console.log("Order payment checks passed: one method and status, unified settlement, retries, receipt discount, expiry, reload, split scenarios.");
