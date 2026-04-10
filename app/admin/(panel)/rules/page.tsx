import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import {
  createRule,
  createRuleStep,
  deleteRule,
  deleteRuleStep,
  updateRule,
  updateRuleStep,
} from "../../actions";

function Bool({ name, checked }: { name: string; checked?: boolean }) {
  return <input type="checkbox" name={name} defaultChecked={checked} />;
}

function RuleFlags({
  defaults,
}: {
  defaults?: {
    allowed?: boolean;
    requiresPrepayment?: boolean;
    canUseWarehouse?: boolean;
    canUseStores?: boolean;
    canUseClickCollect?: boolean;
  };
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200/80 bg-slate-50/90 p-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
      <label className="flex items-center gap-2">
        <Bool name="allowed" checked={defaults?.allowed ?? true} />
        Правило активно
      </label>
      <label className="flex items-center gap-2">
        <Bool name="requiresPrepayment" checked={defaults?.requiresPrepayment ?? false} />
        Нужна предоплата
      </label>
      <label className="flex items-center gap-2">
        <Bool name="canUseWarehouse" checked={defaults?.canUseWarehouse ?? true} />
        Можно со склада
      </label>
      <label className="flex items-center gap-2">
        <Bool name="canUseStores" checked={defaults?.canUseStores ?? true} />
        Можно из магазина
      </label>
      <label className="flex items-center gap-2">
        <Bool name="canUseClickCollect" checked={defaults?.canUseClickCollect ?? true} />
        Разрешен click & collect
      </label>
    </div>
  );
}

function HoldDaysFields({
  defaults,
}: {
  defaults?: {
    storePickupHoldDays?: number;
    clickCollectHoldDays?: number;
    pvzHoldDays?: number;
  };
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <label className="space-y-1">
        <span className="text-xs text-slate-600">Хранение самовывоза из наличия, дней</span>
        <input
          name="storePickupHoldDays"
          type="number"
          min={1}
          defaultValue={defaults?.storePickupHoldDays ?? 3}
          className="w-full"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-slate-600">Хранение click & collect, дней</span>
        <input
          name="clickCollectHoldDays"
          type="number"
          min={1}
          defaultValue={defaults?.clickCollectHoldDays ?? 8}
          className="w-full"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-slate-600">Хранение ПВЗ, дней</span>
        <input name="pvzHoldDays" type="number" min={1} defaultValue={defaults?.pvzHoldDays ?? 5} className="w-full" />
      </label>
    </div>
  );
}

export default async function AdminRulesPage() {
  const [list, cities, methods] = await Promise.all([
    prisma.shippingRule.findMany({
      include: { city: true, deliveryMethod: true, ruleSteps: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ cityId: "asc" }, { deliveryMethodId: "asc" }],
    }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.deliveryMethod.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1>Логистические правила</h1>
      <p className="admin-page-lead">
        Для пары «город + способ получения» задаются срок, стоимость, флаги доступности источников и пошаговый подбор отправлений (склад / магазин / пороги).
      </p>

      <h2 className="mt-8">Новое правило</h2>
      <form action={createRule} className="admin-form-card mt-3 space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Город</span>
            <select name="cityId" className="w-full">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Способ получения</span>
            <select name="deliveryMethodId" className="w-full">
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Срок, дней</span>
            <input name="leadTimeDays" type="number" defaultValue={1} className="w-full" />
          </label>
          <label className="space-y-1 md:col-span-3">
            <span className="text-xs text-slate-600">Текст срока для клиента</span>
            <input name="leadTimeLabel" placeholder="Например: Завтра, 15:00–18:00" className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Стоимость доставки, ₽</span>
            <input name="deliveryPrice" type="number" defaultValue={0} className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Порог бесплатной доставки, ₽</span>
            <input name="freeDeliveryThreshold" type="number" defaultValue={0} className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Макс. отправлений</span>
            <input name="maxShipments" type="number" min={1} defaultValue={2} className="w-full" />
          </label>
        </div>

        <HoldDaysFields />

        <RuleFlags />

        <AdminSubmitButton variant="primary" className="w-full" pendingLabel="Добавляем правило…">
          Добавить правило
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Настроенные правила</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Правил пока нет"
            description="Создайте правило для комбинации города и способа получения — без неё движок не сможет посчитать сроки и шаги для этого кейса."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
        {list.map((r) => (
          <div key={r.id} className="admin-form-card admin-form-card--compact space-y-3 text-sm">
            <form action={updateRule} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {r.city.name} · {r.deliveryMethod.name}
                </div>
                <div className="font-mono text-xs text-slate-500">{r.deliveryMethod.code}</div>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Срок, дней</span>
                  <input name="leadTimeDays" type="number" defaultValue={r.leadTimeDays} className="w-full" />
                </label>
                <label className="space-y-1 md:col-span-3">
                  <span className="text-xs text-slate-600">Текст срока</span>
                  <input name="leadTimeLabel" defaultValue={r.leadTimeLabel} className="w-full" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Стоимость, ₽</span>
                  <input name="deliveryPrice" type="number" defaultValue={r.deliveryPrice} className="w-full" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Бесплатно от, ₽</span>
                  <input
                    name="freeDeliveryThreshold"
                    type="number"
                    defaultValue={r.freeDeliveryThreshold}
                    className="w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Макс. отправлений</span>
                  <input name="maxShipments" type="number" min={1} defaultValue={r.maxShipments} className="w-full" />
                </label>
              </div>

              <HoldDaysFields
                defaults={{
                  storePickupHoldDays: r.storePickupHoldDays,
                  clickCollectHoldDays: r.clickCollectHoldDays,
                  pvzHoldDays: r.pvzHoldDays,
                }}
              />

              <RuleFlags
                defaults={{
                  allowed: r.allowed,
                  requiresPrepayment: r.requiresPrepayment,
                  canUseWarehouse: r.canUseWarehouse,
                  canUseStores: r.canUseStores,
                  canUseClickCollect: r.canUseClickCollect,
                }}
              />

              <div className="flex flex-wrap gap-2">
                <AdminSubmitButton variant="secondary" size="sm" silentPending>
                  Сохранить
                </AdminSubmitButton>
                <AdminConfirmSubmitButton
                  formAction={deleteRule}
                  message={`Удалить правило «${r.city.name} · ${r.deliveryMethod.name}» и все его шаги?`}
                  silentPending
                >
                  Удалить
                </AdminConfirmSubmitButton>
              </div>
            </form>

            <div className="admin-subsection">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Шаги подбора отправлений
              </h3>
              <div className="mt-2 space-y-2">
                {r.ruleSteps.map((s) => (
                  <form
                    key={s.id}
                    action={updateRuleStep}
                    className="admin-form-card admin-form-card--tight grid gap-2 text-xs md:grid-cols-12"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-slate-600">Порядок</span>
                      <input name="sortOrder" type="number" defaultValue={s.sortOrder} className="w-full" />
                    </label>
                    <label className="space-y-1 md:col-span-3">
                      <span className="text-slate-600">Источник</span>
                      <select name="sourceType" defaultValue={s.sourceType} className="w-full">
                        <option value="warehouse">warehouse</option>
                        <option value="store">store</option>
                        <option value="any">any</option>
                      </select>
                    </label>
                    <label className="space-y-1 md:col-span-3">
                      <span className="text-slate-600">Совпадение</span>
                      <select name="matchMode" defaultValue={s.matchMode} className="w-full">
                        <option value="full">full (100%)</option>
                        <option value="threshold">threshold (%)</option>
                      </select>
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-slate-600">Порог, % (для threshold)</span>
                      <input
                        name="thresholdPercent"
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={s.thresholdPercent}
                        className="w-full"
                      />
                    </label>
                    <label className="flex items-center gap-2 md:col-span-2">
                      <input
                        type="checkbox"
                        name="continueAfterMatch"
                        defaultChecked={s.continueAfterMatch}
                      />
                      продолжать
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-12">
                      <AdminSubmitButton variant="secondary" size="sm" silentPending>
                        Сохранить шаг
                      </AdminSubmitButton>
                      <AdminConfirmSubmitButton
                        formAction={deleteRuleStep}
                        message="Удалить этот шаг подбора?"
                        silentPending
                      >
                        Удалить шаг
                      </AdminConfirmSubmitButton>
                    </div>
                  </form>
                ))}
              </div>

              <form
                action={createRuleStep}
                className="admin-form-card admin-form-card--tight admin-form-card--dashed mt-3 grid gap-2 text-xs md:grid-cols-12"
              >
                <input type="hidden" name="shippingRuleId" value={r.id} />
                <label className="space-y-1 md:col-span-2">
                  <span className="text-slate-600">Порядок</span>
                  <input name="sortOrder" type="number" defaultValue={10} className="w-full" />
                </label>
                <label className="space-y-1 md:col-span-3">
                  <span className="text-slate-600">Источник</span>
                  <select name="sourceType" defaultValue="warehouse" className="w-full">
                    <option value="warehouse">warehouse</option>
                    <option value="store">store</option>
                    <option value="any">any</option>
                  </select>
                </label>
                <label className="space-y-1 md:col-span-3">
                  <span className="text-slate-600">Совпадение</span>
                  <select name="matchMode" defaultValue="full" className="w-full">
                    <option value="full">full (100%)</option>
                    <option value="threshold">threshold (%)</option>
                  </select>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-slate-600">Порог, % (для threshold)</span>
                  <input
                    name="thresholdPercent"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={100}
                    className="w-full"
                  />
                </label>
                <label className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" name="continueAfterMatch" defaultChecked />
                  продолжать
                </label>
                <AdminSubmitButton
                  variant="primary"
                  size="sm"
                  className="md:col-span-12"
                  pendingLabel="Добавляем шаг…"
                >
                  Добавить шаг
                </AdminSubmitButton>
              </form>
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
