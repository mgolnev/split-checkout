"use client";

import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "danger";

function variantClass(v: Variant) {
  if (v === "primary") return "admin-btn-primary";
  if (v === "danger") return "admin-btn-danger";
  return "admin-btn-secondary";
}

/** Отправка с подтверждением (удаление и др.). Должна быть внутри &lt;form&gt;. */
export function AdminConfirmSubmitButton({
  message = "Удалить эту запись? Действие нельзя отменить.",
  children,
  variant = "danger",
  size = "sm",
  pendingLabel = "Удаление…",
  silentPending = false,
  className = "",
  disabled,
  onClick,
  ...props
}: Omit<React.ComponentProps<"button">, "type" | "onClick"> & {
  message?: string;
  variant?: Variant;
  size?: "sm";
  pendingLabel?: string;
  silentPending?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
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
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          e.stopPropagation();
        }
        onClick?.(e);
      }}
      {...props}
    >
      {showWait ? pendingLabel : children}
    </button>
  );
}
