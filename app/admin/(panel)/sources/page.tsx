import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { createSource, deleteSource, updateSource } from "../../actions";

export default async function AdminSourcesPage() {
  const [list, cities] = await Promise.all([
    prisma.source.findMany({ include: { city: true }, orderBy: [{ cityId: "asc" }, { priority: "asc" }] }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1>Источники отгрузки</h1>
      <p className="admin-page-lead">
        Склады и магазины внутри города. Приоритет влияет на порядок в логике остатков и правил.
      </p>

      <h2 className="mt-8">Добавить источник</h2>
      <form action={createSource} className="admin-form-card mt-3 grid gap-2 text-sm md:grid-cols-6">
        <input name="name" placeholder="Название" className="md:col-span-2" required aria-label="Название источника" />
        <select name="type" aria-label="Тип источника">
          <option value="warehouse">warehouse</option>
          <option value="store">store</option>
        </select>
        <select name="cityId" aria-label="Город">
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="priority" type="number" defaultValue={0} aria-label="Приоритет (меньше — раньше)" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="isActive" defaultChecked /> active
        </label>
        <AdminSubmitButton variant="primary" className="md:col-span-6" pendingLabel="Добавляем…">
          Добавить источник
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Все источники</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Источников нет"
            description="Создайте источник и привяжите его к городу — остатки и шаги правил ссылаются на источники."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {list.map((s) => (
            <form key={s.id} action={updateSource} className="admin-form-card admin-form-card--compact grid gap-2 text-sm md:grid-cols-8">
              <input type="hidden" name="id" value={s.id} />
              <input name="name" defaultValue={s.name} className="md:col-span-2" aria-label="Название" />
              <select name="type" defaultValue={s.type} aria-label="Тип">
                <option value="warehouse">warehouse</option>
                <option value="store">store</option>
              </select>
              <select name="cityId" defaultValue={s.cityId} aria-label="Город">
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input name="priority" type="number" defaultValue={s.priority} aria-label="Приоритет" />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="isActive" defaultChecked={s.isActive} /> active
              </label>
              <AdminSubmitButton variant="secondary" size="sm" silentPending>
                Сохранить
              </AdminSubmitButton>
              <AdminConfirmSubmitButton
                formAction={deleteSource}
                name="id"
                value={s.id}
                message={`Удалить источник «${s.name}»? Проверьте остатки и шаги правил, ссылающиеся на него.`}
                silentPending
              >
                Удалить
              </AdminConfirmSubmitButton>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
