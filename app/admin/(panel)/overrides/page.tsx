import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { createOverride, deleteOverride, setOverrideEnabledForm, updateOverride } from "../../actions";

const DEFAULT_PAYLOAD = `{
  "parts": [],
  "remainder": [],
  "informers": []
}`;

export default async function AdminOverridesPage() {
  const [list, cities] = await Promise.all([
    prisma.scenarioOverride.findMany({
      include: { city: true },
      orderBy: { name: "asc" },
    }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1>Override-сценарии</h1>
      <p className="admin-page-lead">
        Принудительная подстановка результата split-engine для связки город + способ получения. Включённый override перекрывает обычный расчёт — проверяйте JSON на валидность.
      </p>

      <h2 className="mt-8">Новый override</h2>
      <form action={createOverride} className="admin-form-card mt-3 grid gap-2 text-xs md:grid-cols-8">
        <input name="name" placeholder="Название" className="md:col-span-2" required aria-label="Название" />
        <select name="cityId" aria-label="Город">
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="deliveryMethod" aria-label="Способ получения">
          <option value="courier">courier</option>
          <option value="pickup">pickup</option>
          <option value="pvz">pvz</option>
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isEnabled" /> enabled
        </label>
        <textarea name="payloadJson" defaultValue={DEFAULT_PAYLOAD} rows={5} className="font-mono md:col-span-8" aria-label="JSON сценария" />
        <AdminSubmitButton variant="primary" className="md:col-span-8 text-sm" pendingLabel="Создаём…">
          Добавить override
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Список</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Overrides не заданы"
            description="Обычный сценарий считается без принудительных подстановок. Добавьте запись, если нужно воспроизвести особый кейс."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {list.map((o) => (
            <div key={o.id} className="admin-surface text-xs">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{o.name}</strong> · {o.city.name} · <span className="font-mono">{o.deliveryMethod}</span>
                </div>
                <div className="flex gap-2" role="group" aria-label="Быстрое включение override">
                  <form action={setOverrideEnabledForm}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="enabled" value="true" />
                    <AdminSubmitButton variant="secondary" size="sm" disabled={o.isEnabled} pendingLabel="Включаем…">
                      Вкл
                    </AdminSubmitButton>
                  </form>
                  <form action={setOverrideEnabledForm}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="enabled" value="false" />
                    <AdminSubmitButton variant="secondary" size="sm" disabled={!o.isEnabled} pendingLabel="Выключаем…">
                      Выкл
                    </AdminSubmitButton>
                  </form>
                </div>
              </div>
              <form action={updateOverride} className="space-y-2">
                <input type="hidden" name="id" value={o.id} />
                <input name="name" defaultValue={o.name} className="w-full" aria-label="Название" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isEnabled" defaultChecked={o.isEnabled} /> enabled
                </label>
                <textarea name="payloadJson" defaultValue={o.payloadJson} rows={6} className="w-full font-mono" aria-label="JSON" />
                <div className="flex flex-wrap gap-2">
                  <AdminSubmitButton variant="secondary" size="sm" silentPending>
                    Сохранить
                  </AdminSubmitButton>
                  <AdminConfirmSubmitButton
                    formAction={deleteOverride}
                    name="id"
                    value={o.id}
                    message={`Удалить override «${o.name}»?`}
                    silentPending
                  >
                    Удалить
                  </AdminConfirmSubmitButton>
                </div>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
