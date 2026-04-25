import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { prisma } from "@/lib/prisma";
import { upsertClientProfileSettings } from "../../actions";

export default async function AdminClientsPage() {
  const profile =
    (await prisma.clientProfileSettings.findUnique({ where: { id: 1 } })) ?? {
      firstName: "Елизавета",
      lastName: "Петрова-Водкина",
      bonusBalanceRub: 1000,
    };

  return (
    <div>
      <h1>Клиенты</h1>
      <p className="admin-page-lead">
        Настройки демо-клиента для checkout/cart: фамилия и имя, которые показываются после подтверждения телефона, и
        баланс бонусов на карте GJ.
      </p>

      <h2 className="mt-8">Профиль клиента</h2>
      <form action={upsertClientProfileSettings} className="admin-form-card mt-3 grid gap-3 md:grid-cols-3">
        <label className="admin-fieldset">
          <span className="admin-field-label">Фамилия</span>
          <input name="lastName" defaultValue={profile.lastName} required aria-label="Фамилия клиента" />
        </label>
        <label className="admin-fieldset">
          <span className="admin-field-label">Имя</span>
          <input name="firstName" defaultValue={profile.firstName} required aria-label="Имя клиента" />
        </label>
        <label className="admin-fieldset">
          <span className="admin-field-label">Бонусы на карте (₽)</span>
          <input
            type="number"
            min={0}
            step={1}
            name="bonusBalanceRub"
            defaultValue={profile.bonusBalanceRub}
            required
            aria-label="Баланс бонусов"
          />
        </label>
        <div className="md:col-span-3">
          <AdminSubmitButton variant="primary" pendingLabel="Сохраняем…">
            Сохранить профиль
          </AdminSubmitButton>
        </div>
      </form>
    </div>
  );
}
