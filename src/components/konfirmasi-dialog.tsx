"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type OpsiKonfirmasi = {
  judul: string;
  pesan: string;
  labelKonfirmasi: string;
  /** "bahaya" for irreversible acts, "tangguh" for heavy-but-recoverable ones. */
  nada: "bahaya" | "tangguh";
};

/**
 * An in-app replacement for window.confirm, built on the native <dialog>:
 * showModal() gives focus trapping, Escape and an inert background for free.
 *
 * `await konfirmasi({...})` resolves true only on the confirm button; Escape,
 * the cancel button and anything else that closes the dialog count as "no".
 * Focus starts on Batal, so a stray Enter never triggers the consequence.
 */
export function useKonfirmasi() {
  const [opsi, setOpsi] = useState<OpsiKonfirmasi | null>(null);
  const penentu = useRef<((ya: boolean) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const batalRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const konfirmasi = useCallback(
    (o: OpsiKonfirmasi) =>
      new Promise<boolean>((selesai) => {
        penentu.current = selesai;
        setOpsi(o);
      }),
    [],
  );

  function selesai(ya: boolean) {
    penentu.current?.(ya);
    penentu.current = null;
    setOpsi(null);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (opsi && !d.open) {
      d.showModal();
      batalRef.current?.focus();
    } else if (!opsi && d.open) {
      d.close();
    }
  }, [opsi]);

  const tombolKonfirmasi =
    opsi?.nada === "bahaya"
      ? { background: "var(--action-danger)", color: "#fff" }
      : { borderColor: "var(--status-pending-text)", color: "var(--status-pending-text)" };

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-judul`}
      aria-describedby={`${id}-pesan`}
      onClose={() => selesai(false)}
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border bg-white p-5 backdrop:bg-black/40"
      style={{ borderColor: "var(--border)" }}
    >
      {opsi ? (
        <>
          <h2 id={`${id}-judul`} className="text-base font-semibold" style={{ color: "var(--midnight)" }}>
            {opsi.judul}
          </h2>
          <p id={`${id}-pesan`} className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            {opsi.pesan}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              ref={batalRef}
              type="button"
              onClick={() => selesai(false)}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => selesai(true)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${opsi.nada === "tangguh" ? "border-2" : ""}`}
              style={tombolKonfirmasi}
            >
              {opsi.labelKonfirmasi}
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );

  return { konfirmasi, dialog };
}
