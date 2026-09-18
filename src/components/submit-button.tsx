"use client";

/// <reference types="react-dom/canary" />
import { useFormStatus } from "react-dom";

/**
 * A submit button that disables itself while its form's server action runs,
 * so a slow network cannot produce a double submission. Drop-in for
 * `<button type="submit">` inside `<form action={serverAction}>`.
 */
export function SubmitButton({
  children,
  labelMenunggu = "Memproses…",
  className = "",
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  labelMenunggu?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form (name="aksi"), only the one that
  // was pressed shows the waiting label; all of them are disabled.
  const ditekan =
    pending && (!rest.name || data?.get(rest.name) === String(rest.value ?? ""));

  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={ditekan || undefined}
      // A caller's own disabled:opacity-* wins; two would race on CSS order.
      className={`${className} disabled:cursor-not-allowed ${
        className.includes("disabled:opacity-") ? "" : "disabled:opacity-60"
      }`}
    >
      {ditekan ? labelMenunggu : children}
    </button>
  );
}
