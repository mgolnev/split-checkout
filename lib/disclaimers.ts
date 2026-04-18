export type DeliveryMethodCode = "courier" | "pickup" | "pvz";

const COMMON = {
  splitApplied:
    "Несколько отправлений — так из корзины попадает в заказ больше позиций.",
  payOnDeliveryOnly:
    "Два и более отправления: оплата только при получении.",
  remainderUnavailable:
    "Часть позиций при текущем выборе не входит в это оформление.",
  remainderKeep:
    "Их можно оформить вторым отправлением ниже или оставить в корзине.",
  oneShipmentPartial: "Одно отправление — всё, что доступно по этому способу.",
  /** Блок «остаток корзины» на чекауте (остаётся в админке как common.*) */
  unresolvedBlockTitle: "Как получить остальные товары",
  unresolvedBlockSubtitle:
    "Добавьте второе отправление или оставьте без оформления — позиции останутся в корзине.",
  unresolvedBlockLinesTitle: "Эти товары пока не вошли в заказ",
  unresolvedBlockCta: "Выбрать способ получения",
  unresolvedBlockNoAlternatives:
    "Для этих товаров сейчас не нашли других способов оформления.",
  /** Блок «промокод или бонусы» на чекауте (common.checkoutPromoBonus*) */
  checkoutPromoBonusTitle: "Промокод или бонусы",
  checkoutPromoBonusBody:
    "В одном заказе можно применить что-то одно: промокод или списание бонусов.",
};

const SYSTEM = {
  cityNotFound: "Город не найден.",
  deliveryMethodUnavailable: "Этот способ получения сейчас недоступен.",
  noActiveProductsForMethod: "По этому способу нет товаров с остатками.",
  noRuleForCityAndMethod: "Для города и способа нет настроенного правила доставки.",
  methodDisabledByRule: "Способ отключён правилом для этого города.",
  unknownMethod: "Неизвестный способ получения.",
};

const BY_METHOD = {
  courier: {
    disabledByRule: "Курьер для этого города отключён правилами.",
    fullWarehouse: "Всё повезём одной отправкой со склада.",
    fullStore: "Всё повезём одной отправкой из магазина.",
    noShipmentBySteps: "Не удалось собрать отправления по шагам правила.",
    noSimpleShipment: "Для этой корзины не удалось подобрать курьерскую отправку.",
  },
  pickup: {
    chooseStore: "Выберите магазин — покажем, что можно забрать.",
    storeNotFound: "Магазин для этого города не найден.",
    clickCollectUnavailable: "Доставка со склада в магазин (click & collect) здесь недоступна.",
    remainderUnavailableInStore:
      "В этом магазине не всё из заказа оформляется сразу — часть уйдёт в остаток.",
    payOnDeliveryOnlySplitPickup:
      "Несколько получений в магазине\nОформим отдельными получениями. Для такого заказа доступна только оплата при получении.",
    selectorNoTodayAllButTodayLater:
      "Сейчас ни в одном магазине нет всех товаров из корзины. Часть можно забрать сегодня, остальные привезём позже.",
    selectorNoTodayLater:
      "Нет магазинов, где часть можно забрать сегодня, а остальное привезти позже.",
    selectorNoTodayOptions:
      "Сегодня забрать не получится, но товары можно привезти в магазин.",
  },
  pvz: {
    intro: "В ПВЗ едут только позиции со склада под этот пункт.",
    partialOrder:
      "В ПВЗ привезём только товары со склада\nВыберите способ получения для остальных товаров ниже или оставьте их в корзине.",
    disabledByRule: "ПВЗ для этого города отключён правилами.",
    noWarehouseInCity: "В городе нет склада для отгрузки в ПВЗ.",
    selectorNoCart: "Нет данных по текущей корзине.",
    selectorUnavailable:
      "ПВЗ обслуживается со склада: для выбранных позиций нет остатка с отгрузкой в пункт. Попробуйте курьера или самовывоз.",
    selectorAllAvailable:
      "Все {total} товаров можно получить через пункт выдачи заказа.",
    selectorPartial:
      "Через ПВЗ можно оформить {available} из {total} товаров. Остальные потребуется оформить другим способом.",
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
  "common.unresolvedBlockTitle": "Чекаут: заголовок блока остатка",
  "common.unresolvedBlockSubtitle": "Чекаут: подзаголовок блока остатка",
  "common.unresolvedBlockLinesTitle": "Чекаут: подпись списка позиций",
  "common.unresolvedBlockCta": "Чекаут: кнопка выбора способа",
  "common.unresolvedBlockNoAlternatives": "Чекаут: нет вариантов доставки",
  "common.checkoutPromoBonusTitle": "Чекаут: заголовок «промокод или бонусы»",
  "common.checkoutPromoBonusBody": "Чекаут: текст «промокод или бонусы»",
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
  "pickup.payOnDeliveryOnlySplitPickup": "Самовывоз: несколько получений — оплата при получении",
  "pickup.selectorNoTodayAllButTodayLater": "Выбор магазина: нет «забрать всё сегодня»",
  "pickup.selectorNoTodayLater": "Выбор магазина: нет «сегодня + позже»",
  "pickup.selectorNoTodayOptions": "Выбор магазина: нет вариантов на сегодня",
  "pvz.intro": "ПВЗ: вводный текст",
  "pvz.partialOrder": "ПВЗ: неполный заказ",
  "pvz.disabledByRule": "ПВЗ: способ отключён",
  "pvz.noWarehouseInCity": "ПВЗ: нет склада в городе",
  "pvz.selectorNoCart": "Выбор ПВЗ: нет данных по корзине",
  "pvz.selectorUnavailable": "Выбор ПВЗ: товары недоступны",
  "pvz.selectorAllAvailable": "Выбор ПВЗ: всё доступно",
  "pvz.selectorPartial": "Выбор ПВЗ: доступна часть",
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

/** Тексты блока «как получить остаток» на чекауте (из админки или дефолты). */
export function unresolvedBlockCopy(overrides?: DisclaimerTextMap) {
  return {
    title: commonDisclaimer("unresolvedBlockTitle", overrides),
    subtitle: commonDisclaimer("unresolvedBlockSubtitle", overrides),
    linesTitle: commonDisclaimer("unresolvedBlockLinesTitle", overrides),
    cta: commonDisclaimer("unresolvedBlockCta", overrides),
    noAlternatives: commonDisclaimer("unresolvedBlockNoAlternatives", overrides),
  };
}

/** Заголовок и текст блока «промокод или бонусы» на чекауте (common.checkoutPromoBonus*). */
export function checkoutPromoBonusCopy(overrides?: DisclaimerTextMap) {
  return {
    promoBonusTitle: commonDisclaimer("checkoutPromoBonusTitle", overrides),
    promoBonusBody: commonDisclaimer("checkoutPromoBonusBody", overrides),
  };
}

/** Все тексты чекаута из DisclaimerTemplate: остаток корзины + промокод/бонусы. */
export function fullCheckoutCopy(overrides?: DisclaimerTextMap) {
  return {
    ...unresolvedBlockCopy(overrides),
    ...checkoutPromoBonusCopy(overrides),
  };
}

/** Тексты для модалок выбора магазина и ПВЗ. */
export function selectorCopy(overrides?: DisclaimerTextMap) {
  return {
    pickup: {
      noTodayAllButTodayLater: methodDisclaimer("pickup", "selectorNoTodayAllButTodayLater", overrides),
      noTodayLater: methodDisclaimer("pickup", "selectorNoTodayLater", overrides),
      noTodayOptions: methodDisclaimer("pickup", "selectorNoTodayOptions", overrides),
    },
    pvz: {
      noCart: methodDisclaimer("pvz", "selectorNoCart", overrides),
      unavailable: methodDisclaimer("pvz", "selectorUnavailable", overrides),
      allAvailable: methodDisclaimer("pvz", "selectorAllAvailable", overrides),
      partial: methodDisclaimer("pvz", "selectorPartial", overrides),
    },
  };
}
