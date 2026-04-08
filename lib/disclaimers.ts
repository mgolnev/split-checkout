export type DeliveryMethodCode = "courier" | "pickup" | "pvz";

const COMMON = {
  splitApplied:
    "Мы разделили заказ на несколько частей, чтобы оформить максимум доступных товаров.",
  payOnDeliveryOnly:
    "Для заказа из нескольких частей доступна только оплата при получении.",
  remainderUnavailable:
    "Часть товаров недоступна выбранным способом и останется в корзине.",
  remainderKeep:
    "Остальные товары сохраним в корзине, вы сможете оформить их отдельным заказом.",
  oneShipmentPartial: "Оформим доступную часть заказа одним отправлением.",
};

const SYSTEM = {
  cityNotFound: "Город не найден.",
  deliveryMethodUnavailable: "Способ получения недоступен.",
  noActiveProductsForMethod:
    "Нет активных товаров с остатками для выбранного способа получения.",
  noRuleForCityAndMethod:
    "Для выбранного города и способа отсутствует логистическое правило.",
  methodDisabledByRule: "Выбранный способ получения отключён логистическим правилом.",
  unknownMethod: "Неизвестный способ получения.",
};

const BY_METHOD = {
  courier: {
    disabledByRule: "Курьерская доставка для этого города недоступна по правилам.",
    fullWarehouse: "Все выбранные товары доставим одной отправкой со склада.",
    fullStore: "Все товары доставим одной отправкой из магазина.",
    noShipmentBySteps: "Не удалось подобрать отправления по настроенным шагам правила.",
    noSimpleShipment:
      "Не удалось подобрать простую курьерскую отправку для этой корзины.",
  },
  pickup: {
    chooseStore: "Выберите магазин, чтобы мы рассчитали доступность товаров.",
    storeNotFound: "Магазин не найден для выбранного города.",
    clickCollectUnavailable:
      "В этом регионе недоступна доставка со склада в магазин (click & collect).",
    remainderUnavailableInStore:
      "Часть товаров нельзя получить в этом магазине и она останется в корзине.",
  },
  pvz: {
    intro:
      "Пункт выдачи получает только складскую часть заказа; товары только из магазинов в ПВЗ не передаём.",
    disabledByRule: "ПВЗ для этого города отключён правилами.",
    noWarehouseInCity: "В городе нет склада для отгрузки в ПВЗ.",
  },
} as const;

/**
 * `null` означает: этот дисклеймер явно выключен в админке и не должен
 * подменяться дефолтным текстом из кода.
 */
export type DisclaimerTextMap = Record<string, string | null>;

type CommonKey = keyof typeof COMMON;
type SystemKey = keyof typeof SYSTEM;
type MethodKey = {
  [M in DeliveryMethodCode]: keyof (typeof BY_METHOD)[M];
};

const CODE_TITLES: Record<string, string> = {
  "common.splitApplied": "Общий: заказ разделён",
  "common.payOnDeliveryOnly": "Общий: только оплата при получении",
  "common.remainderUnavailable": "Общий: часть товаров недоступна",
  "common.remainderKeep": "Общий: остаток остаётся в корзине",
  "common.oneShipmentPartial": "Общий: оформляем доступную часть",
  "system.cityNotFound": "Система: город не найден",
  "system.deliveryMethodUnavailable": "Система: способ получения недоступен",
  "system.noActiveProductsForMethod": "Система: нет товаров для способа",
  "system.noRuleForCityAndMethod": "Система: нет логистического правила",
  "system.methodDisabledByRule": "Система: способ отключён правилом",
  "system.unknownMethod": "Система: неизвестный способ",
  "courier.disabledByRule": "Курьер: способ отключён",
  "courier.fullWarehouse": "Курьер: всё со склада",
  "courier.fullStore": "Курьер: всё из магазина",
  "courier.noShipmentBySteps": "Курьер: не удалось подобрать по шагам",
  "courier.noSimpleShipment": "Курьер: не удалось подобрать отправку",
  "pickup.chooseStore": "Самовывоз: выберите магазин",
  "pickup.storeNotFound": "Самовывоз: магазин не найден",
  "pickup.clickCollectUnavailable": "Самовывоз: click&collect недоступен",
  "pickup.remainderUnavailableInStore": "Самовывоз: часть недоступна в магазине",
  "pvz.intro": "ПВЗ: вводный текст",
  "pvz.disabledByRule": "ПВЗ: способ отключён",
  "pvz.noWarehouseInCity": "ПВЗ: нет склада в городе",
};

export const DISCLAIMER_DEFAULTS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(COMMON).map(([k, v]) => [`common.${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(SYSTEM).map(([k, v]) => [`system.${k}`, v]),
  ),
  ...Object.fromEntries(
    (Object.entries(BY_METHOD) as [DeliveryMethodCode, Record<string, string>][]).flatMap(
      ([method, map]) => Object.entries(map).map(([k, v]) => [`${method}.${k}`, v]),
    ),
  ),
};

export function resolveDisclaimer(code: string, overrides?: DisclaimerTextMap): string {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, code)) {
    const raw = overrides[code];
    if (raw === null) return "";
    const custom = raw?.trim();
    return custom ?? "";
  }
  return DISCLAIMER_DEFAULTS[code] ?? "";
}

export function compactDisclaimers(list: Array<string | null | undefined>): string[] {
  return list.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

export function commonDisclaimer(key: CommonKey, overrides?: DisclaimerTextMap): string {
  return resolveDisclaimer(`common.${String(key)}`, overrides);
}

export function systemDisclaimer(key: SystemKey, overrides?: DisclaimerTextMap): string {
  return resolveDisclaimer(`system.${String(key)}`, overrides);
}

export function methodDisclaimer<M extends DeliveryMethodCode>(
  method: M,
  key: MethodKey[M],
  overrides?: DisclaimerTextMap,
): string {
  return resolveDisclaimer(`${method}.${String(key)}`, overrides);
}

export function defaultDisclaimerRows() {
  return Object.entries(DISCLAIMER_DEFAULTS).map(([code, text]) => ({
    code,
    title: CODE_TITLES[code] ?? code,
    text,
  }));
}
