import { AdminShell } from "@/components/admin/AdminShell";

/** Без этого Next.js кэширует страницы с Prisma — после удаления товаров остатки «зависали» в UI. */
export const dynamic = "force-dynamic";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
