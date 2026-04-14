import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UI kit — чекаут",
  description: "Эталонные элементы интерфейса чекаута для сопоставления с макетами дизайнера.",
};

export default function UiKitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
