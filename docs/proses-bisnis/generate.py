"""Generate the SIM-KS business-process diagrams (Bizagi-style BPMN 2.0).

One model per process feeds two outputs, so the picture and the importable file
never drift apart:

  * an inline SVG, embedded in proses-bisnis.html;
  * a BPMN 2.0 XML file with diagram interchange (DI), which Bizagi Modeler
    opens through File > Import > BPMN 2.0 (any BPMN 2.0 tool will do).

Run:  python3 docs/proses-bisnis/generate.py
"""

from __future__ import annotations

import html
import re
from pathlib import Path

OUT = Path(__file__).parent

CW = 168          # column width
POOL_HDR = 34     # pool title strip
LANE_HDR = 34     # lane title strip
X0, Y0 = 10, 10   # pool origin
TASK_W, TASK_H = 116, 62
EV_R = 18
GW = 26           # gateway half-diagonal


class Proses:
    def __init__(self, pid: str, nama: str, lanes: list[tuple[str, str, int, int]], kolom: int):
        self.pid, self.nama = pid, nama
        self.lanes = {}
        y = Y0
        for lid, lnama, tinggi, utama in lanes:
            self.lanes[lid] = dict(id=lid, nama=lnama, y=y, h=tinggi, utama=utama)
            y += tinggi
        self.lebar = POOL_HDR + LANE_HDR + 40 + kolom * CW
        self.tinggi = y - Y0
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []

    # -- coordinates -------------------------------------------------------
    def X(self, col: float) -> float:
        return X0 + POOL_HDR + LANE_HDR + 30 + TASK_W / 2 + col * CW

    def Y(self, lane: str, off: float | None = None) -> float:
        l = self.lanes[lane]
        return l["y"] + (l["utama"] if off is None else off)

    # -- nodes -------------------------------------------------------------
    def node(self, nid, kind, lane, col, label, dy=0, note=None, attach=None, ndx=0, lab="below"):
        cx, cy = self.X(col), self.Y(lane) + dy
        if kind in ("start", "end", "timerStart", "timer", "boundary"):
            w = h = EV_R * 2
        elif kind in ("xor", "and"):
            w = h = GW * 2
        else:
            w, h = TASK_W, TASK_H
        n = dict(id=nid, kind=kind, lane=lane, cx=cx, cy=cy, w=w, h=h, label=label, note=note, attach=attach,
                 ndx=ndx, lab=lab)
        self.nodes[nid] = n
        return n

    def boundary(self, nid, host, label, side="bottom", frac=0.72):
        h = self.nodes[host]
        cx = h["cx"] - h["w"] / 2 + h["w"] * frac
        cy = h["cy"] + h["h"] / 2
        n = dict(id=nid, kind="boundary", lane=h["lane"], cx=cx, cy=cy, w=EV_R * 2, h=EV_R * 2,
                 label=label, note=None, attach=host, ndx=0, lab="right")
        self.nodes[nid] = n

    def P(self, nid, side, off=0):
        """Port on a side; `off` slides it along that side (x for t/b, y for l/r)."""
        n = self.nodes[nid]
        cx, cy, w, h = n["cx"], n["cy"], n["w"], n["h"]
        if side in ("t", "b"):
            cx += off
        elif side in ("l", "r"):
            cy += off
        return {
            "l": (cx - w / 2, cy), "r": (cx + w / 2, cy),
            "t": (cx, cy - h / 2), "b": (cx, cy + h / 2),
            # gateway lower-right facet midpoint
            "br": (cx + w / 4, cy + h / 4),
        }[side]

    # -- edges -------------------------------------------------------------
    def edge(self, a, b, pts, label=None, lpos=None, anchor="start"):
        self.edges.append(dict(id=f"F_{a}_{b}", a=a, b=b, pts=pts, label=label, lpos=lpos, anchor=anchor))


# ---------------------------------------------------------------------------
# Proses 1 — Pengajuan & Persetujuan Kerja Sama
# ---------------------------------------------------------------------------

def proses_persetujuan() -> Proses:
    p = Proses("P1", "Pengajuan & Persetujuan Kerja Sama", [
        ("U", "Unit Pengusul", 150, 75),
        ("A", "Admin KUI", 230, 158),
        ("J", "Pejabat Disposisi (Tier 1–3)", 190, 80),
        ("S", "Sistem SIM-KS", 190, 70),
    ], kolom=11.6)
    X, Y, P = p.X, p.Y, p.P
    rowA2 = -100  # pencatatan-langsung row inside the Admin lane

    p.node("s_mulai", "start", "U", 0, "Kebutuhan kerja sama")
    p.node("t_isi", "user", "U", 1, "Isi formulir proposal (Bagian I–IV)", note="Draft")
    p.node("t_ajukan", "user", "U", 2, "Ajukan proposal", note="Diajukan")

    p.node("s_langsung", "start", "A", 0, "Dokumen sudah ditandatangani", dy=rowA2)
    p.node("t_catat", "user", "A", 1, "Catat dokumen langsung", dy=rowA2,
           note="Pencatatan Langsung")

    p.node("t_disposisi", "user", "A", 3, "Pilih pejabat & kirim disposisi", note="Diproses", ndx=26)
    p.node("t_reaktivasi", "user", "A", 4, "Aktifkan kembali dokumen", note="ronde baru, Tier 1",
           ndx=-16)
    p.node("t_revisi", "user", "A", 6, "Unggah revisi draft", note="SLA tetap berjalan", ndx=58)
    p.node("t_ttd", "user", "A", 8, "Cetak & tandai Siap TTD", note="Disetujui → Siap TTD",
           ndx=-42)
    p.node("t_sign", "manual", "A", 9, "Penandatanganan dokumen (offline)")
    p.node("t_aktivasi", "user", "A", 10, "Aktivasi dokumen & unggah berkas TTD")
    p.node("e_aktif", "end", "A", 11, "Kerja sama Aktif", note="Aktif")

    p.node("t_tinjau", "user", "J", 5, "Tinjau proposal", note="Disposisi – Tier n", ndx=-34)
    p.boundary("b_sla", "t_tinjau", "SLA 2 / 4 hari kerja", frac=0.9)
    p.node("g_kep", "xor", "J", 6, "Keputusan?")
    p.node("e_tolak", "end", "J", 6.6, "Ditolak & diarsipkan", dy=72)
    p.node("g_tier", "xor", "J", 7.4, "Masih ada tier di atas?")

    p.node("t_tier", "service", "S", 4, "Buka tier terendah yang belum setuju & kirim notifikasi")
    p.node("t_sla", "service", "S", 5, "Tandai SLA kuning/merah & kirim pengingat")
    p.node("e_sla", "end", "S", 5.62, "")
    p.node("t_beku", "service", "S", 6.6, "Bekukan dokumen & hentikan jam SLA", note="Pending", ndx=-18)

    # Unit pengusul
    p.edge("s_mulai", "t_isi", [P("s_mulai", "r"), P("t_isi", "l")])
    p.edge("t_isi", "t_ajukan", [P("t_isi", "r"), P("t_ajukan", "l")])
    p.edge("t_ajukan", "t_disposisi", [P("t_ajukan", "r"), (X(3), Y("U")), P("t_disposisi", "t")])

    # Pencatatan langsung
    p.edge("s_langsung", "t_catat", [P("s_langsung", "r"), P("t_catat", "l")])
    p.edge("t_catat", "e_aktif", [P("t_catat", "r"), (X(11), Y("A", 158 + rowA2)), P("e_aktif", "t")])

    # Disposition loop
    p.edge("t_disposisi", "t_tier", [P("t_disposisi", "b", -30), (X(3) - 30, Y("S")), P("t_tier", "l")])
    p.edge("t_tier", "t_tinjau", [P("t_tier", "r"), (X(4.5), Y("S")), (X(4.5), Y("J")), P("t_tinjau", "l")])
    p.edge("t_tinjau", "g_kep", [P("t_tinjau", "r"), P("g_kep", "l")])

    p.edge("g_kep", "t_revisi", [P("g_kep", "t"), P("t_revisi", "b")], "Revisi",
           lpos=(X(6) + 6, Y("J") - 44))
    p.edge("t_revisi", "t_tinjau", [P("t_revisi", "l"), (X(5), Y("A")), P("t_tinjau", "t")])
    p.edge("g_kep", "g_tier", [P("g_kep", "r"), P("g_tier", "l")], "Setuju",
           lpos=(X(6) + 32, Y("J") - 8))
    p.edge("g_kep", "e_tolak", [P("g_kep", "br"), (P("g_kep", "br")[0], Y("J") + 72), P("e_tolak", "l")], "Tolak",
           lpos=(X(6) + 18, Y("J") + 52))
    p.edge("g_kep", "t_beku", [P("g_kep", "b"), (X(6), Y("S")), P("t_beku", "l")], "Pending",
           lpos=(X(6) - 52, Y("J") + 96))

    cor1 = Y("S", 150)
    cor2 = Y("S", 172)
    p.edge("g_tier", "t_tier", [P("g_tier", "b"), (X(7.4), cor1), (X(4), cor1), P("t_tier", "b")], "Ya",
           lpos=(X(7.4) + 6, Y("J") + 50))
    p.edge("g_tier", "t_ttd", [P("g_tier", "r"), (X(8) + 30, Y("J")), P("t_ttd", "b", 30)], "Tidak",
           lpos=(X(7.4) + 30, Y("J") - 8))
    p.edge("t_beku", "t_reaktivasi", [P("t_beku", "b", 34), (X(6.6) + 34, cor2), (X(3.5), cor2), (X(3.5), Y("A")),
                                      P("t_reaktivasi", "l")], "IO mengaktifkan kembali",
           lpos=(X(4.6), cor2 - 10))
    p.edge("t_reaktivasi", "t_tier", [P("t_reaktivasi", "b", 46), P("t_tier", "t", 46)])

    p.edge("b_sla", "t_sla", [P("b_sla", "b"), (P("b_sla", "b")[0], Y("S") - 50), (X(5), Y("S") - 50),
                              P("t_sla", "t")])
    p.edge("t_sla", "e_sla", [P("t_sla", "r"), P("e_sla", "l")])

    # Signing and activation
    p.edge("t_ttd", "t_sign", [P("t_ttd", "r"), P("t_sign", "l")])
    p.edge("t_sign", "t_aktivasi", [P("t_sign", "r"), P("t_aktivasi", "l")])
    p.edge("t_aktivasi", "e_aktif", [P("t_aktivasi", "r"), P("e_aktif", "l")])
    return p


# ---------------------------------------------------------------------------
# Proses 2 — Pembaruan & Evaluasi Kerja Sama
# ---------------------------------------------------------------------------

def proses_pembaruan() -> Proses:
    p = Proses("P2", "Pembaruan & Evaluasi Kerja Sama", [
        ("S", "Sistem SIM-KS", 160, 80),
        ("A", "Admin KUI", 230, 160),
        ("U", "Unit Pemilik (Fakultas / Unit)", 200, 90),
        ("M", "Mitra Eksternal", 140, 70),
    ], kolom=13.6)
    X, Y, P = p.X, p.Y, p.P
    row2 = -98

    p.node("s_sapu", "timerStart", "S", 0, "Sapu harian 05:00 WIB")
    p.node("t_tandai", "service", "S", 1, "Tandai Akan Berakhir & kirim pengingat",
           note="bulanan 6 bln, mingguan 2 bln")

    p.node("t_disp", "user", "A", 2, "Kirim disposisi evaluasi (otomatis / pilih manual)")
    p.node("g_split", "and", "A", 3, "")
    p.node("t_tautan", "user", "A", 4, "Aktifkan tautan evaluasi mitra", note="token 256-bit", ndx=-42)
    p.node("g_join", "and", "A", 6, "")
    p.node("g_rek", "xor", "A", 7, "Rekomendasi kedua evaluasi?", lab="below-right")
    p.node("t_override", "user", "A", 7, "Putuskan override & catat alasan", dy=row2)
    p.node("g_ovr", "xor", "A", 8.25, "Lanjutkan?", dy=row2)
    p.node("t_mulai", "user", "A", 8.25, "Mulai Proses Pembaruan")
    p.node("t_setuju", "sub", "A", 10, "Proses Persetujuan (Proses 1)")
    p.node("t_aktif", "user", "A", 11, "Aktivasi dokumen baru")

    p.node("t_evf", "user", "U", 5, "Isi evaluasi fakultas", note="rekomendasi lanjut / tidak")
    p.node("t_unggah", "user", "U", 9, "Unggah draft & buat proposal perpanjangan",
           note="gerbang dicek database")

    p.node("t_evm", "user", "M", 4, "Isi evaluasi mitra tanpa login", note="/evaluasi/[token]")

    p.node("i_berakhir", "timer", "S", 8.25, "Tanggal berakhir tiba", lab="above")
    p.node("t_arsip", "service", "S", 9, "Arsipkan dokumen", note="expired_without_renewal")
    p.node("e_tidak", "end", "S", 10, "Tidak diperpanjang")
    p.node("t_tautkan", "service", "S", 12, "Tautkan ke dokumen lama & arsipkan",
           note="superseded_by_renewal", ndx=-28)
    p.node("e_baru", "end", "S", 13, "Kerja sama diperpanjang")

    p.edge("s_sapu", "t_tandai", [P("s_sapu", "r"), P("t_tandai", "l")])
    p.edge("t_tandai", "t_disp", [P("t_tandai", "r"), (X(2), Y("S")), P("t_disp", "t")])
    p.edge("t_disp", "g_split", [P("t_disp", "r"), P("g_split", "l")])
    p.edge("g_split", "t_tautan", [P("g_split", "r"), P("t_tautan", "l")])
    p.edge("g_split", "t_evf", [P("g_split", "b"), (X(3), Y("U")), P("t_evf", "l")])
    p.edge("t_tautan", "t_evm", [P("t_tautan", "b"), P("t_evm", "t")])
    p.edge("t_evf", "g_join", [P("t_evf", "t"), (X(5), Y("A")), P("g_join", "l")])
    p.edge("t_evm", "g_join", [P("t_evm", "r"), (X(6), Y("M")), P("g_join", "b")])
    p.edge("g_join", "g_rek", [P("g_join", "r"), P("g_rek", "l")])

    p.edge("g_rek", "t_mulai", [P("g_rek", "r"), P("t_mulai", "l")], "Keduanya lanjut",
           lpos=(X(7) + 30, Y("A") - 8))
    p.edge("g_rek", "t_override", [P("g_rek", "t"), P("t_override", "b")], "Berbeda",
           lpos=(X(7) + 6, Y("A") - 40))
    xcor = X(6.5)
    p.edge("g_rek", "i_berakhir", [P("g_rek", "b"), (X(7), Y("A", 212)), (xcor, Y("A", 212)),
                                   (xcor, Y("S")), P("i_berakhir", "l")], "Keduanya tidak",
           lpos=(X(6.5) + 8, Y("A", 212) - 10))
    p.edge("t_override", "g_ovr", [P("t_override", "r"), P("g_ovr", "l")])
    p.edge("g_ovr", "t_mulai", [P("g_ovr", "b"), P("t_mulai", "t")], "Ya",
           lpos=(X(8.25) + 6, Y("A", 160 + row2) + 46))
    p.edge("g_ovr", "i_berakhir", [P("g_ovr", "t"), P("i_berakhir", "b")], "Tidak",
           lpos=(X(8.25) + 6, Y("A", 160 + row2) - 40))

    p.edge("i_berakhir", "t_arsip", [P("i_berakhir", "r"), P("t_arsip", "l")])
    p.edge("t_arsip", "e_tidak", [P("t_arsip", "r"), P("e_tidak", "l")])

    p.edge("t_mulai", "t_unggah", [P("t_mulai", "r"), (X(9), Y("A")), P("t_unggah", "t")])
    p.edge("t_unggah", "t_setuju", [P("t_unggah", "r"), (X(10), Y("U")), P("t_setuju", "b")])
    p.edge("t_setuju", "t_aktif", [P("t_setuju", "r"), P("t_aktif", "l")])
    p.edge("t_aktif", "t_tautkan", [P("t_aktif", "r"), (X(12) + 44, Y("A")), P("t_tautkan", "b", 44)])
    p.edge("t_tautkan", "e_baru", [P("t_tautkan", "r"), P("e_baru", "l")])
    return p


# ---------------------------------------------------------------------------
# SVG rendering (Bizagi Modeler look)
# ---------------------------------------------------------------------------

def bungkus(teks: str, maks: int) -> list[str]:
    baris, kini = [], ""
    for kata in teks.split():
        if kini and len(kini) + 1 + len(kata) > maks:
            baris.append(kini)
            kini = kata
        else:
            kini = f"{kini} {kata}".strip()
    if kini:
        baris.append(kini)
    return baris


def teks(x, y, isi, cls, maks=18, lh=13, anchor="middle", valign="middle"):
    baris = bungkus(isi, maks)
    if valign == "middle":
        y0 = y - (len(baris) - 1) * lh / 2
    else:
        y0 = y
    spans = "".join(
        f'<tspan x="{x:.1f}" y="{y0 + i * lh:.1f}">{html.escape(b)}</tspan>' for i, b in enumerate(baris)
    )
    return f'<text class="{cls}" text-anchor="{anchor}" dominant-baseline="central">{spans}</text>'


def ikon(kind, x, y):
    if kind == "user":
        return (f'<g class="ic" transform="translate({x:.1f},{y:.1f})">'
                f'<circle cx="7" cy="5" r="3.6"/><path d="M0.5 16 C0.5 10 13.5 10 13.5 16 Z"/></g>')
    if kind == "service":
        teeth = "".join(
            f'<rect x="5.6" y="-0.4" width="2.8" height="4" rx="0.6" transform="rotate({a} 7 7)"/>'
            for a in range(0, 360, 45))
        return (f'<g class="ic" transform="translate({x:.1f},{y:.1f})">{teeth}'
                f'<circle cx="7" cy="7" r="4.8"/><circle class="ic-hole" cx="7" cy="7" r="1.8"/></g>')
    if kind == "manual":
        return (f'<g class="ic" transform="translate({x:.1f},{y:.1f})">'
                f'<path d="M1 9 L1 15 L12 15 C13.5 15 13.5 12.8 12 12.8 L13 12.8 C14.5 12.8 14.5 10.6 13 10.6 '
                f'L12.6 10.6 C14 10.6 14 8.4 12.6 8.4 L7 8.4 L9.5 5.6 C10.5 4.4 9 3.2 8 4.2 Z"/></g>')
    return ""


def jam(cx, cy, r):
    ticks = "".join(
        f'<line x1="{cx:.1f}" y1="{cy - r + 1.5:.1f}" x2="{cx:.1f}" y2="{cy - r + 3.5:.1f}" '
        f'transform="rotate({a} {cx:.1f} {cy:.1f})"/>' for a in range(0, 360, 30))
    return (f'<g class="clock"><circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}"/>{ticks}'
            f'<path d="M{cx:.1f} {cy - r * 0.6:.1f} L{cx:.1f} {cy:.1f} L{cx + r * 0.45:.1f} {cy + r * 0.15:.1f}"/></g>')


def render_svg(p: Proses) -> str:
    W = X0 * 2 + p.lebar
    H = Y0 * 2 + p.tinggi + 10
    o = [f'<svg class="bpmn" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-label="Diagram BPMN: {html.escape(p.nama)}" xmlns="http://www.w3.org/2000/svg">',
         '<defs>'
         f'<linearGradient id="gT{p.pid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-task-a"/>'
         f'<stop offset="1" class="g-task-b"/></linearGradient>'
         f'<marker id="ar{p.pid}" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" '
         f'orient="auto-start-reverse"><path class="arrow" d="M0 1 L10 5 L0 9 Z"/></marker>'
         '</defs>']

    # pool + lanes
    px, py = X0, Y0
    o.append(f'<rect class="pool" x="{px}" y="{py}" width="{p.lebar}" height="{p.tinggi}"/>')
    o.append(f'<rect class="pool-hdr" x="{px}" y="{py}" width="{POOL_HDR}" height="{p.tinggi}"/>')
    o.append(f'<text class="pool-t" transform="translate({px + POOL_HDR / 2 + 1},{py + p.tinggi / 2}) rotate(-90)" '
             f'text-anchor="middle" dominant-baseline="central">PCU · KUI — {html.escape(p.nama)}</text>')
    for i, l in enumerate(p.lanes.values()):
        lx = px + POOL_HDR
        o.append(f'<rect class="lane {"lane-alt" if i % 2 else ""}" x="{lx}" y="{l["y"]}" '
                 f'width="{p.lebar - POOL_HDR}" height="{l["h"]}"/>')
        o.append(f'<rect class="lane-hdr" x="{lx}" y="{l["y"]}" width="{LANE_HDR}" height="{l["h"]}"/>')
        o.append(f'<text class="lane-t" transform="translate({lx + LANE_HDR / 2 + 1},{l["y"] + l["h"] / 2}) '
                 f'rotate(-90)" text-anchor="middle" dominant-baseline="central">{html.escape(l["nama"])}</text>')

    # edges first so shapes sit on top
    for e in p.edges:
        d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in e["pts"])
        o.append(f'<path class="flow" d="{d}" marker-end="url(#ar{p.pid})"/>')
        if e["label"]:
            lx, ly = e["lpos"]
            o.append(f'<text class="flow-l" x="{lx:.1f}" y="{ly:.1f}" dominant-baseline="central">'
                     f'{html.escape(e["label"])}</text>')

    for n in p.nodes.values():
        cx, cy, w, h, k = n["cx"], n["cy"], n["w"], n["h"], n["kind"]
        if k in ("user", "service", "manual", "sub"):
            x, y = cx - w / 2, cy - h / 2
            o.append(f'<rect class="task" x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="9" '
                     f'fill="url(#gT{p.pid})"/>')
            o.append(ikon(k, x + 6, y + 5))
            o.append(teks(cx + (4 if k != "sub" else 0), cy + (-3 if k == "sub" else 5), n["label"], "task-t", maks=18))
            if k == "sub":
                o.append(f'<rect class="sub-m" x="{cx - 7:.1f}" y="{y + h - 15:.1f}" width="14" height="14"/>'
                         f'<path class="sub-p" d="M{cx:.1f} {y + h - 12:.1f} V{y + h - 4:.1f} '
                         f'M{cx - 4:.1f} {y + h - 8:.1f} H{cx + 4:.1f}"/>')
        elif k in ("start", "timerStart"):
            o.append(f'<circle class="ev-start" cx="{cx:.1f}" cy="{cy:.1f}" r="{EV_R}"/>')
            if k == "timerStart":
                o.append(jam(cx, cy, 11))
        elif k == "end":
            o.append(f'<circle class="ev-end" cx="{cx:.1f}" cy="{cy:.1f}" r="{EV_R - 1.5}"/>')
        elif k in ("timer", "boundary"):
            # A dashed ring marks the boundary timer as non-interrupting.
            dash = ' stroke-dasharray="4 3"' if k == "boundary" else ""
            o.append(f'<circle class="ev-int" cx="{cx:.1f}" cy="{cy:.1f}" '
                     f'r="{EV_R - (3 if k == "boundary" else 0)}"{dash}/>')
            o.append(f'<circle class="ev-int-in" cx="{cx:.1f}" cy="{cy:.1f}" '
                     f'r="{EV_R - (6 if k == "boundary" else 3.5)}"{dash}/>')
            o.append(jam(cx, cy, 8.5 if k == "boundary" else 10))
        elif k in ("xor", "and"):
            o.append(f'<path class="gw" d="M{cx:.1f} {cy - GW:.1f} L{cx + GW:.1f} {cy:.1f} '
                     f'L{cx:.1f} {cy + GW:.1f} L{cx - GW:.1f} {cy:.1f} Z"/>')
            if k == "xor":
                s = 8
                o.append(f'<path class="gw-m" d="M{cx - s:.1f} {cy - s:.1f} L{cx + s:.1f} {cy + s:.1f} '
                         f'M{cx + s:.1f} {cy - s:.1f} L{cx - s:.1f} {cy + s:.1f}"/>')
            else:
                s = 11
                o.append(f'<path class="gw-m" d="M{cx:.1f} {cy - s:.1f} V{cy + s:.1f} M{cx - s:.1f} {cy:.1f} '
                         f'H{cx + s:.1f}"/>')

        # labels outside events/gateways (Bizagi puts them underneath)
        if k in ("start", "end", "timerStart", "timer") and n["label"]:
            if n["lab"] == "above":
                nb = len(bungkus(n["label"], 16))
                o.append(teks(cx, cy - EV_R - 8 - (nb - 1) * 13, n["label"], "ev-t", maks=16, valign="top"))
            else:
                o.append(teks(cx, cy + EV_R + 8, n["label"], "ev-t", maks=16, valign="top"))
        if k == "boundary":
            o.append(teks(cx + EV_R + 4, cy + 10, n["label"], "ev-t", maks=12, anchor="start", valign="top"))
        if k in ("xor", "and") and n["label"] and n["lab"] == "below-right":
            o.append(teks(cx + GW + 6, cy + GW + 4, n["label"], "ev-t", maks=16, anchor="start", valign="top"))
        elif k in ("xor", "and") and n["label"]:
            o.append(teks(cx - GW - 4, cy - GW - 10, n["label"], "ev-t", maks=16, anchor="end", valign="middle"))
        if n["note"]:
            ny = cy + h / 2 + 11 if k not in ("start", "end") else cy + EV_R + 22 + 6
            if k == "end":
                ny = cy + EV_R + 8 + 13 * len(bungkus(n["label"], 16)) + 4
            o.append(teks(cx + n["ndx"], ny, n["note"], "note", maks=26, valign="top"))
    o.append("</svg>")
    return "\n".join(x for x in o if x)


# ---------------------------------------------------------------------------
# BPMN 2.0 XML with DI (imports into Bizagi Modeler)
# ---------------------------------------------------------------------------

TAG = {"user": "userTask", "service": "serviceTask", "manual": "manualTask", "sub": "callActivity",
       "start": "startEvent", "timerStart": "startEvent", "end": "endEvent", "timer": "intermediateCatchEvent",
       "boundary": "boundaryEvent", "xor": "exclusiveGateway", "and": "parallelGateway"}


def render_bpmn(p: Proses) -> str:
    q = lambda s: html.escape(s, quote=True)
    inc: dict[str, list[str]] = {}
    out: dict[str, list[str]] = {}
    for e in p.edges:
        out.setdefault(e["a"], []).append(e["id"])
        inc.setdefault(e["b"], []).append(e["id"])

    proc = []
    proc.append('    <laneSet id="LS_%s">' % p.pid)
    for l in p.lanes.values():
        refs = "".join(f"\n        <flowNodeRef>{n['id']}</flowNodeRef>"
                       for n in p.nodes.values() if n["lane"] == l["id"])
        proc.append(f'      <lane id="L_{p.pid}_{l["id"]}" name="{q(l["nama"])}">{refs}\n      </lane>')
    proc.append("    </laneSet>")
    for n in p.nodes.values():
        tag = TAG[n["kind"]]
        attrs = f'id="{n["id"]}" name="{q(n["label"])}"'
        if n["kind"] == "boundary":
            attrs += f' attachedToRef="{n["attach"]}" cancelActivity="false"'
        body = "".join(f"\n      <incoming>{i}</incoming>" for i in inc.get(n["id"], []))
        body += "".join(f"\n      <outgoing>{i}</outgoing>" for i in out.get(n["id"], []))
        if n["kind"] in ("timerStart", "timer", "boundary"):
            body += f'\n      <timerEventDefinition id="TD_{n["id"]}"/>'
        if n["note"]:
            body = f'\n      <documentation>{q(n["note"])}</documentation>' + body
        proc.append(f"    <{tag} {attrs}>{body}\n    </{tag}>")
    for e in p.edges:
        nm = f' name="{q(e["label"])}"' if e["label"] else ""
        proc.append(f'    <sequenceFlow id="{e["id"]}"{nm} sourceRef="{e["a"]}" targetRef="{e["b"]}"/>')

    di = [f'      <bpmndi:BPMNShape id="DI_POOL_{p.pid}" bpmnElement="POOL_{p.pid}" isHorizontal="true">'
          f'<dc:Bounds x="{X0}" y="{Y0}" width="{p.lebar}" height="{p.tinggi}"/></bpmndi:BPMNShape>']
    for l in p.lanes.values():
        di.append(f'      <bpmndi:BPMNShape id="DI_L_{p.pid}_{l["id"]}" bpmnElement="L_{p.pid}_{l["id"]}" '
                  f'isHorizontal="true"><dc:Bounds x="{X0 + POOL_HDR}" y="{l["y"]}" '
                  f'width="{p.lebar - POOL_HDR}" height="{l["h"]}"/></bpmndi:BPMNShape>')
    for n in p.nodes.values():
        extra = ' isExpanded="false"' if n["kind"] == "sub" else ""
        di.append(f'      <bpmndi:BPMNShape id="DI_{n["id"]}" bpmnElement="{n["id"]}"{extra}>'
                  f'<dc:Bounds x="{n["cx"] - n["w"] / 2:.0f}" y="{n["cy"] - n["h"] / 2:.0f}" '
                  f'width="{n["w"]:.0f}" height="{n["h"]:.0f}"/></bpmndi:BPMNShape>')
    for e in p.edges:
        wps = "".join(f'<di:waypoint x="{x:.0f}" y="{y:.0f}"/>' for x, y in e["pts"])
        lab = ""
        if e["label"] and e["lpos"]:
            lx, ly = e["lpos"]
            lab = (f'<bpmndi:BPMNLabel><dc:Bounds x="{lx:.0f}" y="{ly - 8:.0f}" '
                   f'width="{len(e["label"]) * 7 + 6}" height="16"/></bpmndi:BPMNLabel>')
        di.append(f'      <bpmndi:BPMNEdge id="DI_{e["id"]}" bpmnElement="{e["id"]}">{wps}{lab}</bpmndi:BPMNEdge>')

    nl = "\n"
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="DEF_{p.pid}" targetNamespace="https://simks.petra.ac.id/bpmn"
             exporter="SIM-KS docs/proses-bisnis/generate.py" exporterVersion="1.0">
  <collaboration id="COL_{p.pid}">
    <participant id="POOL_{p.pid}" name="PCU · KUI — {q(p.nama)}" processRef="PROC_{p.pid}"/>
  </collaboration>
  <process id="PROC_{p.pid}" name="{q(p.nama)}" isExecutable="false">
{nl.join(proc)}
  </process>
  <bpmndi:BPMNDiagram id="DIA_{p.pid}" name="{q(p.nama)}">
    <bpmndi:BPMNPlane id="PL_{p.pid}" bpmnElement="COL_{p.pid}">
{nl.join(di)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>
'''


def main():
    hasil = {}
    for fn, nama_file in ((proses_persetujuan, "01-pengajuan-persetujuan.bpmn"),
                          (proses_pembaruan, "02-pembaruan-evaluasi.bpmn")):
        p = fn()
        (OUT / nama_file).write_text(render_bpmn(p), encoding="utf-8")
        hasil[p.pid] = render_svg(p)

    halaman = OUT / "proses-bisnis.html"
    isi = halaman.read_text(encoding="utf-8")
    for pid, svg in hasil.items():
        isi = re.sub(rf"(<!-- SVG:{pid} -->).*?(<!-- /SVG:{pid} -->)",
                     lambda m: f"{m.group(1)}\n{svg}\n{m.group(2)}", isi, flags=re.S)
    halaman.write_text(isi, encoding="utf-8")
    print("ok:", ", ".join(hasil))


if __name__ == "__main__":
    main()
