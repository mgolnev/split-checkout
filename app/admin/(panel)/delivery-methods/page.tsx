import { AdminConfirmSubmitButton } from "@/components/admin/AdminConfirmSubmitButton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import {
  createDeliveryMethod,
  deleteDeliveryMethod,
  updateDeliveryMethod,
} from "../../actions";

export default async function AdminDeliveryMethodsPage() {
  const list = await prisma.deliveryMethod.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1>Способы получения</h1>
      <p className="admin-page-lead">
        Код способа (courier / pickup / pvz) должен совпадать с тем, что ожидает движок сценария и формы checkout.
      </p>

      <h2 className="mt-8">Добавить способ</h2>
      <form action={createDeliveryMethod} className="admin-form-card mt-3 grid gap-2 text-sm md:grid-cols-3">
        <input name="code" placeholder="code (courier/pickup/pvz)" required aria-label="Код способа" />
        <input name="name" placeholder="Название" required aria-label="Название для интерфейса" />
        <AdminSubmitButton variant="primary" pendingLabel="Добавляем…">
          Добавить способ
        </AdminSubmitButton>
      </form>

      <h2 className="mt-10">Настроенные способы</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <AdminEmptyState
            title="Способов получения нет"
            description="Без хотя бы одного способа checkout не сможет предложить доставку или самовывоз."
          />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {list.map((m) => (
            <form key={m.id} action={updateDeliveryMethod} className="admin-form-card admin-form-card--compact grid gap-2 text-sm md:grid-cols-6">
              <input type="hidden" name="id" value={m.id} />
              <input name="code" defaultValue={m.code} aria-label="Код" />
              <input name="name" defaultValue={m.name} className="md:col-span-2" aria-label="Название" />
              <label className="flex items-center gap-2 text-xs">
                <input name="isActive" type="checkbox" defaultChecked={m.isActive} /> active
              </label>
              <AdminSubmitButton variant="secondary" size="sm" silentPending>
                Сохранить
              </AdminSubmitButton>
              <AdminConfirmSubmitButton
                formAction={deleteDeliveryMethod}
                message={`Удалить способ «${m.name}» (${m.code})? Правила доставки с этим способом нужно будет обновить.`}
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
