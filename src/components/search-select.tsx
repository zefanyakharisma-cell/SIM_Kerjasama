"use client";

import { useState } from "react";

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

/**
 * A searchable dropdown built on the native <input list> datalist idiom
 * already used elsewhere in this form (e.g. Tujuan Kerja Sama) — typing
 * filters the list, picking a value resolves it back to an id via a hidden
 * input, so the server action still receives a plain numeric id (Revisi V4
 * §1.a.1, §2.a).
 */
export function SearchSelect({
  name,
  options,
  defaultValue,
  placeholder,
  className,
  onValueChange,
  ariaLabel,
}: {
  name: string;
  options: { id: number; label: string }[];
  defaultValue?: number | null;
  placeholder?: string;
  className?: string;
  onValueChange?: (id: number | null) => void;
  /** Accessible name when the field is not wrapped in a <label>. */
  ariaLabel?: string;
}) {
  const awal = options.find((o) => o.id === defaultValue) ?? null;
  const [teks, setTeks] = useState(awal?.label ?? "");
  const [id, setId] = useState<number | "">(awal?.id ?? "");
  const listId = `dl-${name}`;

  function ubah(nilai: string) {
    setTeks(nilai);
    const cocok = options.find(
      (o) => o.label.trim().toLowerCase() === nilai.trim().toLowerCase(),
    );
    setId(cocok?.id ?? "");
    onValueChange?.(cocok?.id ?? null);
  }

  return (
    <>
      <input
        list={listId}
        value={teks}
        onChange={(e) => ubah(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className ?? inputKelas}
        style={inputGaya}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={id} />
    </>
  );
}
