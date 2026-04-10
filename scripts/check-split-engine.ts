import assert from "node:assert/strict";
import { computeScenario } from "../lib/split-engine";

type Inv = {
  productId: string;
  sourceId: string;
  quantity: number;
  availableForCourier: boolean;
  availableForPickup: boolean;
  availableForPVZ: boolean;
};

const products = [
  { id: "a", name: "A", sku: "A", price: 1000, image: "" },
  { id: "b", name: "B", sku: "B", price: 1000, image: "" },
  { id: "c", name: "C", sku: "C", price: 1000, image: "" },
  { id: "d", name: "D", sku: "D", price: 1000, image: "" },
  { id: "e", name: "E", sku: "E", price: 1000, image: "" },
];

const sources = [
  { id: "wh", name: "Warehouse", type: "warehouse", priority: 1 },
  { id: "s1", name: "Store #1", type: "store", priority: 2 },
  { id: "s2", name: "Store #2", type: "store", priority: 3 },
  { id: "s3", name: "Store #3", type: "store", priority: 4 },
];

const rule = {
  allowed: true,
  maxShipments: 2,
  storePickupHoldDays: 3,
  clickCollectHoldDays: 8,
  pvzHoldDays: 5,
  leadTimeDays: 1,
  leadTimeLabel: "Tomorrow",
  deliveryPrice: 299,
  freeDeliveryThreshold: 1500,
  canUseWarehouse: true,
  canUseStores: true,
  canUseClickCollect: true,
};

const cart5 = [
  { productId: "a", quantity: 1 },
  { productId: "b", quantity: 1 },
  { productId: "c", quantity: 1 },
  { productId: "d", quantity: 1 },
  { productId: "e", quantity: 1 },
];

function inv(productId: string, sourceId: string, quantity: number): Inv {
  return {
    productId,
    sourceId,
    quantity,
    availableForCourier: true,
    availableForPickup: true,
    availableForPVZ: sourceId === "wh",
  };
}

function unitsOfPart(part: { items: { quantity: number }[] }) {
  return part.items.reduce((sum, item) => sum + item.quantity, 0);
}

function runScenario(name: string, cartLines: { productId: string; quantity: number }[], inventories: Inv[]) {
  const scenario = computeScenario({
    cartLines,
    deliveryMethodCode: "courier",
    cityHasClickCollect: true,
    selectedStoreId: null,
    products,
    sources,
    inventories,
    rule,
  });
  console.log(`- ${name}: parts=${scenario.parts.length}, remainder=${scenario.remainder.length}`);
  return scenario;
}

function main() {
  const c1 = runScenario("1/1 only warehouse", [{ productId: "a", quantity: 1 }], [inv("a", "wh", 1)]);
  assert.equal(c1.parts.length, 1);
  assert.equal(c1.parts[0]?.sourceId, "wh");
  assert.equal(c1.remainder.length, 0);

  const c2 = runScenario("3/5 warehouse + 2/5 store", cart5, [
    inv("a", "wh", 1),
    inv("b", "wh", 1),
    inv("c", "wh", 1),
    inv("d", "s1", 1),
    inv("e", "s1", 1),
  ]);
  assert.equal(c2.parts.length, 2);
  assert.equal(unitsOfPart(c2.parts[0]!), 3);
  assert.equal(unitsOfPart(c2.parts[1]!), 2);
  assert.equal(c2.remainder.length, 0);
  assert.equal(c2.parts[0]?.deliveryPrice, 0);
  assert.equal(c2.parts[1]?.deliveryPrice, 0);

  const c3 = runScenario("store >=40% with remainder", cart5, [
    inv("a", "s1", 1),
    inv("b", "s1", 1),
    inv("c", "s1", 1),
    inv("d", "s2", 1),
  ]);
  assert.equal(c3.parts.length, 2);
  assert.equal(unitsOfPart(c3.parts[0]!), 3);
  assert.equal(unitsOfPart(c3.parts[1]!), 1);
  assert.equal(c3.remainder.reduce((sum, line) => sum + line.quantity, 0), 1);

  const c4 = runScenario("staircase 1/5", cart5, [inv("a", "s1", 1)]);
  assert.equal(c4.parts.length, 1);
  assert.equal(unitsOfPart(c4.parts[0]!), 1);
  assert.equal(c4.remainder.reduce((sum, line) => sum + line.quantity, 0), 4);

  const c5 = computeScenario({
    cartLines: cart5,
    deliveryMethodCode: "courier",
    cityHasClickCollect: true,
    selectedStoreId: null,
    products,
    sources,
    inventories: [inv("a", "wh", 1), inv("b", "wh", 1), inv("c", "s1", 1), inv("d", "s2", 1), inv("e", "s3", 1)],
    rule: { ...rule, maxShipments: 4 },
  });
  assert.equal(c5.parts.length, 4);
  assert.equal(c5.remainder.length, 0);

  const c6 = computeScenario({
    cartLines: [
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 1 },
      { productId: "c", quantity: 1 },
      { productId: "d", quantity: 1 },
    ],
    deliveryMethodCode: "courier",
    cityHasClickCollect: true,
    selectedStoreId: null,
    products,
    sources,
    inventories: [inv("a", "wh", 1), inv("b", "s1", 1), inv("c", "s2", 1), inv("d", "s3", 1)],
    rule: {
      ...rule,
      maxShipments: 4,
      steps: [
        { sortOrder: 10, sourceType: "warehouse", matchMode: "full", thresholdPercent: 100, continueAfterMatch: false },
        { sortOrder: 20, sourceType: "store", matchMode: "full", thresholdPercent: 100, continueAfterMatch: false },
        { sortOrder: 30, sourceType: "warehouse", matchMode: "threshold", thresholdPercent: 40, continueAfterMatch: true },
        { sortOrder: 40, sourceType: "store", matchMode: "full", thresholdPercent: 100, continueAfterMatch: true },
        { sortOrder: 50, sourceType: "any", matchMode: "threshold", thresholdPercent: 10, continueAfterMatch: true },
      ],
    },
  });
  assert.equal(c6.parts.length, 4);
  assert.deepEqual(
    c6.parts.map((part) => part.sourceId),
    ["wh", "s1", "s2", "s3"],
  );
  assert.equal(c6.remainder.length, 0);

  console.log("Split engine checks passed.");
}

main();
