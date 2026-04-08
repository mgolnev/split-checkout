import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { pruneInventoryOrphans } from "@/lib/inventory-maintenance";
import { prisma } from "@/lib/prisma";
import { deleteInventoryById, upsertInventory } from "../../actions";

export default async function AdminInventoryPage() {
  await pruneInventoryOrphans();

  const [list, products, sources] = await Promise.all([
    prisma.inventory.findMany({
      where: {
        quantity: { gt: 0 },
        product: { isActive: true },
        source: { isActive: true },
      },
      include: { product: true, source: true },
      orderBy: [{ sourceId: "asc" }, { productId: "asc" }],
      take: 120,
    }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.source.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1>Остатки</h1>
      <p className="admin-page-lead">
        Здесь показаны ненулевые остатки по активным товарам и источникам. Флаги курьер / самовывоз / ПВЗ ограничивают выдачу в сценарии.
      </p>

      <h2 className="mt-8">Создать или обновить остаток</h2>
      <form action={upsertInventory} className="admin-form-card mt-3 grid gap-2 text-sm md:grid-cols-7">
        <select name="productId" className="md:col-span-2" aria-label="Товар">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="sourceId" className="md:col-span-2" aria-label="Источник">
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="quantity" type="number" defaultValue={0} aria-label="Количество" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="availableForCourier" defaultChecked /> курьер
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="availableForPickup" defaultChecked /> самовывоз
        </label>
        <label className="flex items-center gap-2 text-xs md:col-span-2">
          <input type="checkbox" name="availableForPVZ" defaultChecked /> ПВЗ
        </label>
        <AdminSubmitButton variant="primary" className="md:col-span-7" pendingLabel="Сохраняем…">
          Создать/обновить остаток
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Текущие остатки (до 120 строк)</h2>
      {products.length === 0 || sources.length === 0 ? (
        <p className="admin-form-hint mt-3">Сначала добавьте активные товары и источники — без них остатки не настроить.</p>
      ) : null}
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Подходящих остатков нет"
            description="Нулевые строки скрыты. Увеличьте количество в форме выше или на странице товара — запись появится в списке."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {list.map((i) => (
            <form key={i.id} action={upsertInventory} className="admin-form-card admin-form-card--compact grid gap-2 text-xs md:grid-cols-10">
              <input type="hidden" name="productId" value={i.productId} />
              <input type="hidden" name="sourceId" value={i.sourceId} />
              <div className="md:col-span-2">{i.product.name}</div>
              <div className="md:col-span-2">{i.source.name}</div>
              <input name="quantity" type="number" defaultValue={i.quantity} aria-label="Количество" />
              <label className="flex items-center gap-1">
                <input name="availableForCourier" type="checkbox" defaultChecked={i.availableForCourier} />
                К
              </label>
              <label className="flex items-center gap-1">
                <input name="availableForPickup" type="checkbox" defaultChecked={i.availableForPickup} />
                С
              </label>
              <label className="flex items-center gap-1">
                <input name="availableForPVZ" type="checkbox" defaultChecked={i.availableForPVZ} />
                ПВЗ
              </label>
              <AdminSubmitButton variant="secondary" size="sm" silentPending>
                Сохранить
              </AdminSubmitButton>
              <AdminConfirmSubmitButton
                formAction={async () => {
                  "use server";
                  await deleteInventoryById(i.id);
                }}
                message={`Удалить остаток «${i.product.name}» / ${i.source.name}?`}
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
