import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { statusText } from "./attendance";

// Deliberately monochrome: the report prints on any office printer and the
// cell text ("Present", "Late by 1h 15m", "Absent", "Half day", an em dash for
// a non-working day) already carries everything colour fills used to.
const INK = [17, 17, 17];
const HEAD = [68, 68, 68];
const FOOT = [237, 237, 237];
const RULE = [190, 190, 190];
const GRAY = [110, 110, 110];

// Fixed, readable type. The layout never shrinks to force a fit — it paginates
// instead, which is what the grid of pages below is for.
const FONT_SIZE = 7.5;
const CELL_PADDING = 1.5;
const DATE_COL_W = 19;

const pretty = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const cellText = (s) => {
  const t = statusText(s);
  if (!t) return s.status === "off" ? "—" : "";
  return t + (s.noCheckout ? " *" : "");
};

const rowLabel = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.toLocaleDateString(undefined, { weekday: "short" }) +
    " " +
    String(d).padStart(2, "0") +
    "/" +
    String(m).padStart(2, "0")
  );
};

// Build and download a formatted PDF of the consolidated matrix.
//   matrix:    [{ date, cells: [{ employeeId, status }] }]  (rows = dates)
//   employees: the column order matching each row's cells
//
// Portrait, so a page holds as many date rows as possible. Dates flow down and
// paginate; employees flow across and paginate too, so a roster wider than the
// page becomes a further set of pages rather than being squeezed. The result is
// an n x m grid: m column-groups of employees, each running n pages of dates.
export function exportMatrixPdf({ matrix, employees, from, to }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const tableTop = margin + 15;
  const tableBottom = margin + 8;

  // How many employee columns fit at full size: measure the widest label that
  // has to sit in one, rather than guessing a width.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SIZE);
  let widest = 0;
  for (const row of matrix) {
    for (const c of row.cells) {
      widest = Math.max(widest, doc.getTextWidth(cellText(c.status)));
    }
  }
  doc.setFont("helvetica", "bold");
  for (const e of employees) {
    widest = Math.max(widest, doc.getTextWidth(e.full_name));
  }
  const minColW = widest + CELL_PADDING * 2 + 1.5;
  const bodyW = pageW - margin * 2 - DATE_COL_W;
  const colsPerPage = Math.max(1, Math.floor(bodyW / minColW));
  const colW = bodyW / colsPerPage;

  // Split the roster into page-width groups.
  const groups = [];
  for (let i = 0; i < employees.length; i += colsPerPage) {
    groups.push({ start: i, list: employees.slice(i, i + colsPerPage) });
  }

  // didDrawPage needs to know which group it is stamping a header for.
  let current = groups[0];

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text("Attendance Report", margin, margin + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(`${pretty(from)} — ${pretty(to)}`, margin, margin + 9.5);

    // Only worth saying when the roster actually spans more than one group.
    if (groups.length > 1) {
      const a = current.start + 1;
      const b = current.start + current.list.length;
      const label = `Employees ${a}–${b} of ${employees.length}`;
      doc.text(label, pageW - margin - doc.getTextWidth(label), margin + 4);
    }
    const stamp = `Generated ${new Date().toLocaleString()}`;
    doc.text(stamp, pageW - margin - doc.getTextWidth(stamp), margin + 9.5);

    // Key, repeated on every page so no page is orphaned from its notation.
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(
      "—  non-working day        *  no check-out recorded",
      margin,
      pageH - 6
    );
  };

  groups.forEach((group, gi) => {
    current = group;
    if (gi > 0) doc.addPage();

    const head = [["Date", ...group.list.map((e) => e.full_name)]];
    const body = matrix.map((row) => [
      rowLabel(row.date),
      ...group.list.map((_, i) => cellText(row.cells[group.start + i].status)),
    ]);
    const totals = group.list.map(
      (_, i) =>
        matrix.filter(
          (r) => r.cells[group.start + i]?.status.status === "present"
        ).length
    );

    autoTable(doc, {
      head,
      body,
      foot: [["Days present", ...totals.map(String)]],
      startY: tableTop,
      // top applies to continuation pages; without it the table would be drawn
      // over the header band that didDrawPage stamps on every page.
      margin: { top: tableTop, left: margin, right: margin, bottom: tableBottom },
      theme: "grid",
      showFoot: "lastPage",
      styles: {
        font: "helvetica",
        fontSize: FONT_SIZE,
        cellPadding: CELL_PADDING,
        halign: "center",
        valign: "middle",
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0.1,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: HEAD,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      footStyles: {
        fillColor: FOOT,
        textColor: INK,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "left", cellWidth: DATE_COL_W, fontStyle: "bold" },
        ...Object.fromEntries(
          group.list.map((_, i) => [i + 1, { cellWidth: colW }])
        ),
      },
      didDrawPage: drawHeader,
    });
  });

  // Page numbers last: the total is only known once every page exists.
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const label = `Page ${i} of ${pageCount}`;
    doc.text(label, pageW - margin - doc.getTextWidth(label), pageH - 6);
  }

  doc.save(`attendance_consolidated_${from}_${to}.pdf`);
}
