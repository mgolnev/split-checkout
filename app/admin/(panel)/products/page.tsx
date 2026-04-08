import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { createProductWithStocks, deleteProduct, saveProductFull } from "../../actions";

export default async function AdminProductsPage() {
  const [list, sources, inventories] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.source.findMany({ where: { isActive: true }, orderBy: { priority: "asc" } }),
    prisma.inventory.findMany(),
  ]);
  const invMap = new Map(inventories.map((i) => [`${i.productId}:${i.sourceId}`, i]));

  return (
    <div>
      <h1>Товары</h1>
      <p className="admin-page-lead">
        Кнопка «Сохранить все изменения» записывает карточку и остатки целиком. Удаление — отдельно внизу строки.
      </p>

      <h2 className="mt-8">Новый товар</h2>
      <form action={createProductWithStocks} className="admin-form-card mt-3 space-y-2 text-sm">
        <div className="admin-product-section admin-product-section--compact">
          <fieldset className="admin-fieldset">
            <legend>Данные товара</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="admin-field-label" htmlFor="new-name">
                  Название
                </label>
                <input
                  id="new-name"
                  name="name"
                  type="text"
                  placeholder="Например: Джинсы slim"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="admin-field-label" htmlFor="new-sku">
                  SKU
                </label>
                <input
                  id="new-sku"
                  name="sku"
                  type="text"
                  className="font-mono"
                  placeholder="JNS-001"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="admin-field-label" htmlFor="new-price">
                  Цена, ₽
                </label>
                <input id="new-price" name="price" type="number" min={0} placeholder="3499" required />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="admin-field-label" htmlFor="new-image">
                  URL картинки
                </label>
                <input
                  id="new-image"
                  name="image"
                  type="url"
                  inputMode="url"
                  className="admin-input-url"
                  placeholder="https://…"
                  autoComplete="off"
                />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="admin-product-section admin-product-section--compact">
          <fieldset className="admin-fieldset">
            <legend>Остатки по источникам</legend>
            <p className="admin-form-hint mb-2 !mt-0">Начальные количества; потом правятся в карточке товара.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {sources.map((s) => (
                <div key={s.id} className="flex min-w-[7rem] flex-col">
                  <label className="admin-field-label" htmlFor={`new-qty-${s.id}`}>
                    {s.name}
                  </label>
                  <input
                    id={`new-qty-${s.id}`}
                    name={`qty_${s.id}`}
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="admin-input-narrow"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <AdminSubmitButton variant="primary" className="w-full sm:w-auto" pendingLabel="Создаём товар…">
          Добавить товар с остатками
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Каталог</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Товаров нет"
            description="Добавьте товар выше — для checkout нужны активные позиции с остатками по выбранному городу и способу."
          />
        </div>
      ) : (
        <ul className="mt-3 list-none space-y-2 p-0">
          {list.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
              <form action={saveProductFull} className="space-y-2 p-2.5 sm:p-3">
                <input type="hidden" name="productId" value={p.id} />

                <div className="rounded-md border border-slate-200/80 bg-slate-50/50 p-2 sm:p-2.5">
                  <fieldset className="admin-fieldset">
                    <legend>Данные товара</legend>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                      <div className="sm:col-span-2 lg:col-span-4">
                        <label className="admin-field-label" htmlFor={`name-${p.id}`}>
                          Название
                        </label>
                        <input
                          id={`name-${p.id}`}
                          name="name"
                          type="text"
                          defaultValue={p.name}
                          required
                          autoComplete="off"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="admin-field-label" htmlFor={`sku-${p.id}`}>
                          SKU
                        </label>
                        <input
                          id={`sku-${p.id}`}
                          name="sku"
                          type="text"
                          className="font-mono"
                          defaultValue={p.sku}
                          required
                          autoComplete="off"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="admin-field-label" htmlFor={`price-${p.id}`}>
                          Цена, ₽
                        </label>
                        <input id={`price-${p.id}`} name="price" type="number" min={0} defaultValue={p.price} required />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4">
                        <label className="admin-field-label" htmlFor={`image-${p.id}`}>
                          URL картинки
                        </label>
                        <input
                          id={`image-${p.id}`}
                          name="image"
                          type="url"
                          inputMode="url"
                          className="admin-input-url"
                          defaultValue={p.image}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        name="isActive"
                        value="on"
                        defaultChecked={p.isActive}
                        className="size-3.5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                      />
                      <span className="font-medium">Товар активен</span>
                      <span className="text-xs font-normal text-slate-500">— иначе не попадёт в checkout</span>
                    </label>
                  </fieldset>

                  <div className="mt-2 border-t border-slate-200/90 pt-2">
                    <fieldset className="admin-fieldset">
                      <legend>Остатки по источникам</legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {sources.map((s) => {
                          const row = invMap.get(`${p.id}:${s.id}`);
                          return (
                            <div key={s.id} className="flex min-w-[7rem] flex-col">
                              <label className="admin-field-label" htmlFor={`qty-${p.id}-${s.id}`}>
                                {s.name}
                              </label>
                              <input
                                id={`qty-${p.id}-${s.id}`}
                                name={`qty_${s.id}`}
                                type="number"
                                min={0}
                                defaultValue={row?.quantity ?? 0}
                                className="admin-input-narrow"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                  <AdminSubmitButton variant="primary" pendingLabel="Сохраняем…">
                    Сохранить все изменения
                  </AdminSubmitButton>
                  <span className="text-[11px] text-slate-500">Вся карточка и остатки</span>
                </div>
              </form>

              <div className="border-t border-slate-100 px-2.5 py-2 sm:px-3">
                <form action={deleteProduct}>
                  <input type="hidden" name="productId" value={p.id} />
                  <AdminConfirmSubmitButton
                    message={`Удалить товар «${p.name}» и все связанные остатки?`}
                    pendingLabel="Удаляем…"
                  >
                    Удалить товар из каталога
                  </AdminConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
