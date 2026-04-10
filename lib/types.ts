export type CartLine = { productId: string; quantity: number };

export type ScenarioLine = {
  productId: string;
  name: string;
  sku: string;
  price: number;
  image: string;
  quantity: number;
};

export type ScenarioPart = {
  key: string;
  sourceId: string;
  sourceName: string;
  sourceType: "warehouse" | "store";
  mode: "courier" | "pvz" | "click_reserve" | "click_collect";
  leadTimeLabel: string;
  holdDays?: number;
  items: ScenarioLine[];
  subtotal: number;
  deliveryPrice: number;
  freeDeliveryThreshold: number;
  defaultIncluded: boolean;
  canToggle: boolean;
};

export type ScenarioResult = {
  parts: ScenarioPart[];
  remainder: CartLine[];
  informers: string[];
  remainderKeepHint?: string;
  payOnDeliveryOnly: boolean;
  fromOverride: boolean;
  deliveryMethodCode: string;
};

export type AlternativeMethodOption = {
  methodCode: "courier" | "pickup" | "pvz";
  methodLabel: string;
  availableUnits: number;
  totalUnits: number;
  unresolvedUnits: number;
  storeId?: string;
  storeName?: string;
  scenario: ScenarioResult;
};

export type RemainderLine = {
  productId: string;
  quantity: number;
};

export type RemainderResolution = {
  lines: RemainderLine[];
  options: AlternativeMethodOption[];
};

export type OverridePartPayload = {
  key: string;
  sourceId: string;
  mode: ScenarioPart["mode"];
  leadTimeLabel: string;
  items: CartLine[];
  defaultIncluded?: boolean;
  canToggle?: boolean;
};

export type OverridePayload = {
  parts: OverridePartPayload[];
  remainder: CartLine[];
  informers?: string[];
};
