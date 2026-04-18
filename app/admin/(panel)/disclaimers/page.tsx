import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { defaultDisclaimerRows } from "@/lib/disclaimers";
import { prisma } from "@/lib/prisma";
import { createDisclaimer, deleteDisclaimer, updateDisclaimer } from "../../actions";

export default async function AdminDisclaimersPage() {
  const savedList = await prisma.disclaimerTemplate.findMany({ orderBy: [{ code: "asc" }] });
  const savedCodes = new Set(savedList.map((d) => d.code));
  const missingDefaults = defaultDisclaimerRows()
    .filter((d) => !savedCodes.has(d.code))
    .map((d) => ({
      id: "",
      code: d.code,
      title: d.title,
      text: d.text,
      isActive: true,
      fromDefaults: true,
    }));
  const list = [
    ...savedList.map((d) => ({ ...d, fromDefaults: false })),
    ...missingDefaults,
  ].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div>
      <h1>Дисклеймеры</h1>
      <p className="admin-page-lead">
        Тексты для информеров в checkout. Код должен совпадать с тем, что ожидает движок (например ветки логистики). Неактивные записи игнорируются.
      </p>

      <h2 className="mt-8">Новый дисклеймер</h2>
      <form action={createDisclaimer} className="admin-form-card mt-3 space-y-2 text-sm">
        <div className="grid gap-2 md:grid-cols-3">
          <input
            name="code"
            placeholder="Код (например courier.fullWarehouse)"
            className="md:col-span-2"
            required
            aria-label="Код дисклеймера"
          />
          <input name="title" placeholder="Название для админки" required aria-label="Название в админке" />
        </div>
        <textarea name="text" rows={3} placeholder="Текст дисклеймера" className="w-full" required aria-label="Текст" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="isActive" defaultChecked /> Активен
        </label>
        <AdminSubmitButton variant="primary" pendingLabel="Добавляем…">
          Добавить дисклеймер
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Все шаблоны</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Дисклеймеров нет"
            description="Добавьте записи с кодами, которые использует сценарий — иначе подставятся значения по умолчанию из кода."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {list.map((d) => (
            <form
              key={d.id || `default-${d.code}`}
              action={d.fromDefaults ? createDisclaimer : updateDisclaimer}
              className="admin-form-card admin-form-card--compact space-y-2 text-sm"
            >
              {d.fromDefaults ? null : <input type="hidden" name="id" value={d.id} />}
              <div className="grid gap-2 md:grid-cols-3">
                <input name="code" defaultValue={d.code} className="md:col-span-2" aria-label="Код" />
                <input name="title" defaultValue={d.title} aria-label="Название" />
              </div>
              <textarea name="text" defaultValue={d.text} rows={3} className="w-full" aria-label="Текст" />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="isActive" defaultChecked={d.isActive} /> Активен
                </label>
                {d.fromDefaults ? (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Шаблон из кода: сохраните, чтобы редактировать через БД
                  </span>
                ) : null}
                <AdminSubmitButton variant="secondary" size="sm" silentPending>
                  {d.fromDefaults ? "Создать" : "Сохранить"}
                </AdminSubmitButton>
                {d.fromDefaults ? null : (
                  <AdminConfirmSubmitButton
                    formAction={deleteDisclaimer}
                    message={`Удалить дисклеймер «${d.title || d.code}»?`}
                    silentPending
                  >
                    Удалить
                  </AdminConfirmSubmitButton>
                )}
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
