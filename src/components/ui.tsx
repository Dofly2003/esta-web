"use client";

import { useFormStatus } from "react-dom";
import { useRef } from "react";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Menyimpan…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** <select> yang langsung submit form-nya saat nilai berubah */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "",
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  options: Record<string, { label: string } | string>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {typeof v === "string" ? v : v.label}
        </option>
      ))}
    </select>
  );
}

/** Tombol submit dengan konfirmasi */
export function ConfirmButton({
  children,
  message = "Yakin ingin menghapus?",
  className = "btn-danger",
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
