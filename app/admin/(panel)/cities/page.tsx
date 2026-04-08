import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { createCity, deleteCity, updateCity } from "../../actions";

export default async function AdminCitiesPage() {
  const list = await prisma.city.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1>Города</h1>
      <p className="admin-page-lead">
        Город задаёт регион и доступность click &amp; collect. Используется при расчёте сценария checkout и привязке источников.
      </p>

      <h2 className="mt-8">Добавить город</h2>
      <p className="admin-form-hint">Обязательные поля помечены атрибутом required в браузере.</p>
      <form action={createCity} className="admin-form-card mt-3 grid gap-2 text-sm md:grid-cols-4">
        <input name="name" placeholder="Название" required aria-label="Название города" />
        <input name="regionType" placeholder="regionType" required aria-label="Тип региона" />
        <label className="flex items-center gap-2 text-xs">
          <input name="hasClickCollect" type="checkbox" defaultChecked /> hasClickCollect
        </label>
        <AdminSubmitButton variant="primary" className="md:col-span-4" pendingLabel="Добавляем…">
          Добавить город
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Список городов</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Городов пока нет"
            description="Добавьте первый город формой выше — без него нельзя настроить источники и правила доставки."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {list.map((c) => (
            <form key={c.id} action={updateCity} className="admin-form-card admin-form-card--compact grid gap-2 text-sm md:grid-cols-6">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} aria-label={`Название: ${c.name}`} />
              <input name="regionType" defaultValue={c.regionType} aria-label="Тип региона" />
              <label className="flex items-center gap-2 text-xs">
                <input name="hasClickCollect" type="checkbox" defaultChecked={c.hasClickCollect} /> C&amp;C
              </label>
              <div className="font-mono text-[11px] text-slate-500" title="Идентификатор в БД">
                {c.id}
              </div>
              <AdminSubmitButton variant="secondary" size="sm" silentPending pendingLabel="Сохранение…">
                Сохранить
              </AdminSubmitButton>
              <AdminConfirmSubmitButton
                formAction={deleteCity}
                name="id"
                value={c.id}
                message={`Удалить город «${c.name}»? Связанные данные могут потребовать правки вручную.`}
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
