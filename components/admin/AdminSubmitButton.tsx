"use client";

import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "danger";

function variantClass(v: Variant) {
  if (v === "primary") return "admin-btn-primary";
  if (v === "danger") return "admin-btn-danger";
  return "admin-btn-secondary";
}

function defaultPending(v: Variant) {
  if (v === "danger") return "Удаление…";
  return "Сохранение…";
}

/** Кнопка отправки с индикатором ожидания (useFormStatus). Должна быть внутри &lt;form&gt;. */
export function AdminSubmitButton({
  children,
  variant = "primary",
  size,
  pendingLabel,
  silentPending = false,
  className = "",
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "type"> & {
  variant?: Variant;
  size?: "sm";
  pendingLabel?: string;
  /** Если в форме несколько submit — без смены текста (только disabled), чтобы не путать подписи. */
  silentPending?: boolean;
}) {
  const { pending } = useFormStatus();
  const vc = variantClass(variant);
  const sm = size === "sm" ? " admin-btn-sm" : "";
  const showWait = pending && !silentPending;
  return (
    <button
      type="submit"
      className={`${vc}${sm}${className ? ` ${className}` : ""}`.trim()}
      disabled={pending || disabled}
      aria-busy={pending}
      {...props}
    >
      {showWait ? (pendingLabel ?? defaultPending(variant)) : children}
    </button>
  );
}
