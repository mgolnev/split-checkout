import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { createPvzPoint, deletePvzPoint, updatePvzPoint } from "../../actions";

export default async function AdminPvzPointsPage() {
  const [list, cities] = await Promise.all([
    prisma.pvzPoint.findMany({ include: { city: true }, orderBy: [{ cityId: "asc" }, { name: "asc" }] }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1>Пункты выдачи (ПВЗ)</h1>
      <p className="admin-page-lead">
        Отдельные точки для способа «ПВЗ» в checkout (не путать с магазинами самовывоза — они в разделе{" "}
        <a href="/admin/sources" className="font-medium text-slate-700 underline">
          Источники отгрузки
        </a>
        , тип <code className="rounded bg-slate-100 px-1">store</code>).
      </p>

      <h2 className="mt-8">Добавить ПВЗ</h2>
      <form action={createPvzPoint} className="admin-form-card mt-3 grid gap-2 text-sm md:grid-cols-6">
        <input name="name" placeholder="Название" className="md:col-span-2" required aria-label="Название ПВЗ" />
        <input
          name="address"
          placeholder="Адрес"
          className="md:col-span-2"
          required
          aria-label="Адрес ПВЗ"
        />
        <select name="cityId" aria-label="Город" required>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="requiresPrepayment" /> предоплата
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="isActive" defaultChecked /> active
        </label>
        <AdminSubmitButton variant="primary" className="md:col-span-6" pendingLabel="Добавляем…">
          Добавить ПВЗ
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Все ПВЗ</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="ПВЗ нет"
            description="Добавьте пункт выдачи и привяжите к городу — он появится в выборе на checkout."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {list.map((p) => (
            <form key={p.id} action={updatePvzPoint} className="admin-form-card admin-form-card--compact grid gap-2 text-sm md:grid-cols-12">
              <input type="hidden" name="id" value={p.id} />
              <input name="name" defaultValue={p.name} className="md:col-span-2" aria-label="Название" />
              <input name="address" defaultValue={p.address} className="md:col-span-4" aria-label="Адрес" />
              <select name="cityId" defaultValue={p.cityId} className="md:col-span-2" aria-label="Город">
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs md:col-span-1">
                <input type="checkbox" name="requiresPrepayment" defaultChecked={p.requiresPrepayment} /> предопл.
              </label>
              <label className="flex items-center gap-2 text-xs md:col-span-1">
                <input type="checkbox" name="isActive" defaultChecked={p.isActive} /> active
              </label>
              <AdminSubmitButton variant="secondary" size="sm" silentPending className="md:col-span-1">
                Сохранить
              </AdminSubmitButton>
              <AdminConfirmSubmitButton
                formAction={deletePvzPoint}
                name="id"
                value={p.id}
                message={`Удалить ПВЗ «${p.name}»?`}
                silentPending
                className="md:col-span-1"
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
