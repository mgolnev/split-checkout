export default function AdminHomePage() {
  return (
    <div>
      <h1>Панель</h1>
      <p className="admin-page-lead mt-3">
        Утилитарная админка для тестовых данных и override-сценариев. Для массового редактирования удобен{" "}
        <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
          npx prisma studio
        </code>
        .
      </p>
      <h2 className="mt-8">Как пользоваться</h2>
      <ul className="mt-3 max-w-2xl space-y-2 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
          <span>Товары, города, источники, остатки, правила и дисклеймеры — просмотр и правка в интерфейсе.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
          <span>Checkout использует активные товары и остатки по городу и способу получения.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
          <span>Overrides — принудительный сценарий для связки корзина + город + способ.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
          <span>
            Удаление везде спрашивает подтверждение; при отправке формы кнопки ненадолго блокируются, чтобы не нажать дважды.
          </span>
        </li>
      </ul>
    </div>
  );
}
