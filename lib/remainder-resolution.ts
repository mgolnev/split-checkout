import { buildScenario } from "@/lib/build-scenario";
import { prisma } from "@/lib/prisma";
import type { AlternativeMethodOption, CartLine, RemainderResolution, ScenarioResult } from "@/lib/types";

function availableUnitsForScenario(scenario: ScenarioResult) {
  return scenario.parts.reduce(
    (sum, part) => sum + part.items.reduce((partSum, item) => partSum + item.quantity, 0),
    0,
  );
}

function totalUnitsForLines(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function deliveryTotalForScenario(scenario: ScenarioResult) {
  return scenario.parts.reduce((sum, part) => sum + part.deliveryPrice, 0);
}

function methodPriority(option: AlternativeMethodOption) {
  if (option.methodCode === "pickup") return 0;
  if (option.methodCode === "courier") return 1;
  return 2;
}

function compareRemainderOptions(a: AlternativeMethodOption, b: AlternativeMethodOption) {
  const aCoversAll = a.unresolvedUnits === 0;
  const bCoversAll = b.unresolvedUnits === 0;
  if (aCoversAll !== bCoversAll) return aCoversAll ? -1 : 1;

  if (b.availableUnits !== a.availableUnits) return b.availableUnits - a.availableUnits;
  if (a.unresolvedUnits !== b.unresolvedUnits) return a.unresolvedUnits - b.unresolvedUnits;
  if (a.scenario.parts.length !== b.scenario.parts.length) return a.scenario.parts.length - b.scenario.parts.length;

  const aDelivery = deliveryTotalForScenario(a.scenario);
  const bDelivery = deliveryTotalForScenario(b.scenario);
  if (aDelivery !== bDelivery) return aDelivery - bDelivery;

  const methodDiff = methodPriority(a) - methodPriority(b);
  if (methodDiff !== 0) return methodDiff;

  if ((a.storeName ?? "") !== (b.storeName ?? "")) return (a.storeName ?? "").localeCompare(b.storeName ?? "", "ru");
  return a.methodLabel.localeCompare(b.methodLabel, "ru");
}

async function pickupOptionsForRemainder(cityId: string, lines: CartLine[], excludedStoreId?: string | null) {
  const stores = await prisma.source.findMany({
    where: { cityId, type: "store", isActive: true, ...(excludedStoreId ? { id: { not: excludedStoreId } } : {}) },
    orderBy: { priority: "asc" },
    select: { id: true, name: true },
  });

  const options: AlternativeMethodOption[] = [];
  const totalUnits = totalUnitsForLines(lines);

  for (const store of stores) {
    const scenario = await buildScenario({
      cityId,
      deliveryMethodCode: "pickup",
      selectedStoreId: store.id,
      lines,
    });
    const availableUnits = availableUnitsForScenario(scenario);
    if (availableUnits <= 0) continue;
    options.push({
      methodCode: "pickup",
      methodLabel: "Самовывоз из магазина",
      availableUnits,
      totalUnits,
      unresolvedUnits: totalUnitsForLines(scenario.remainder),
      storeId: store.id,
      storeName: store.name,
      scenario,
    });
  }

  return options.sort(compareRemainderOptions);
}

async function methodOptionForRemainder(cityId: string, lines: CartLine[], methodCode: "courier" | "pvz") {
  const scenario = await buildScenario({
    cityId,
    deliveryMethodCode: methodCode,
    selectedStoreId: null,
    lines,
  });
  const availableUnits = availableUnitsForScenario(scenario);
  if (availableUnits <= 0) return null;
  const totalUnits = totalUnitsForLines(lines);
  const option: AlternativeMethodOption = {
    methodCode,
    methodLabel: methodCode === "pvz" ? "ПВЗ" : "Курьер",
    availableUnits,
    totalUnits,
    unresolvedUnits: totalUnitsForLines(scenario.remainder),
    scenario,
  };
  return option;
}

/**
 * Варианты доставки для произвольного набора строк корзины (остаток сценария или снятые с отправления позиции).
 */
export async function buildRemainderResolution(
  cityId: string,
  deliveryMethodCode: "courier" | "pickup" | "pvz",
  remainder: CartLine[],
  selectedStoreId?: string | null,
): Promise<RemainderResolution | null> {
  if (remainder.length === 0) return null;

  const alternativeMethodCodes =
    deliveryMethodCode === "pickup"
      ? (["courier", "pickup", "pvz"] as const)
      : (["courier", "pickup", "pvz"] as const).filter((code) => code !== deliveryMethodCode);

  const options: AlternativeMethodOption[] = [];
  for (const code of alternativeMethodCodes) {
    if (code === "pickup") {
      const pickupOptions = await pickupOptionsForRemainder(
        cityId,
        remainder,
        deliveryMethodCode === "pickup" ? selectedStoreId : null,
      );
      options.push(...pickupOptions);
      continue;
    }
    const option = await methodOptionForRemainder(cityId, remainder, code);
    if (option) options.push(option);
  }

  options.sort(compareRemainderOptions);

  return {
    lines: remainder,
    options,
  };
}
