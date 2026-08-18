import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { statusText } from "./attendance";

// Deliberately monochrome: the report prints on any office printer and the
// cell text ("Present", "Late by 1h 15m", "Absent", "Half day", an em dash for
// a non-working day) already carries everything the colour fills used to.
const INK = [17, 17, 17];
const HEAD = [68, 68, 68];
const FOOT = [237, 237, 237];
const RULE = [190, 190, 190];
const GRAY = [110, 110, 110];

const pretty = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Build and download a formatted PDF of the consolidated matrix.
//   matrix:    [{ date, cells: [{ employeeId, status }] }]  (rows = dates)
//   employees: the column order matching each row's cells
export function exportMatrixPdf({ matrix, employees, from, to }) {
  // Always portrait, and sized so the whole range fits on a single page where
  // it can — that way one employee's record is read straight down one column
  // without turning over.
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const tableTop = margin + 14;    // below the title band
  const tableBottom = margin + 12; // above legend + page number

  const head = [["Date", ...employees.map((e) => e.full_name)]];

  const body = matrix.map((row) => {
    const [y, m, d] = row.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const label =
      dt.toLocaleDateString(undefined, { weekday: "short" }) +
      " " +
      String(d).padStart(2, "0") +
      "/" +
      String(m).padStart(2, "0");
    return [
      label,
      ...row.cells.map((c) => {
        const t = statusText(c.status);
        if (!t) return c.status.status === "off" ? "—" : "";
        return t + (c.status.noCheckout ? " *" : "");
      }),
    ];
  });

  const totals = employees.map(
    (_, i) => matrix.filter((r) => r.cells[i]?.status.status === "present").length
  );
  const foot = [["Days present", ...totals.map(String)]];

  // Shrink type/padding until every date row fits one page, down to a floor
  // where it would stop being readable; past that it paginates as normal.
  const PT_MM = 0.3528;
  const LINE = 1.15;
  const avail = pageH - tableTop - tableBottom;
  const rowCount = body.length + 2; // + header + totals
  let fontSize = 7.5;
  let cellPadding = 1.5;
  const rowHeight = () => fontSize * PT_MM * LINE + cellPadding * 2;
  while (rowCount * rowHeight() > avail && fontSize > 4.6) {
    fontSize -= 0.1;
    cellPadding = Math.max(0.35, cellPadding - 0.045);
  }
  const dateColW = fontSize < 6 ? 16 : 19;
  const bodyW = pageW - margin * 2 - dateColW;
  const colW = bodyW / Math.max(employees.length, 1);

  autoTable(doc, {
    head,
    body,
    foot,
    startY: tableTop,
    // top applies to continuation pages; without it the table would be drawn
    // over the header band that didDrawPage stamps on every page.
    margin: { top: tableTop, left: margin, right: margin, bottom: tableBottom },
    theme: "grid",
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize,
      cellPadding,
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
      fontSize: Math.min(fontSize, 6.8),
      cellPadding: Math.max(cellPadding, 1),
    },
    footStyles: {
      fillColor: FOOT,
      textColor: INK,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: dateColW, fontStyle: "bold" },
      ...Object.fromEntries(employees.map((_, i) => [i + 1, { cellWidth: colW }])),
    },
    didDrawPage: () => {
      // Header band, repeated on every page.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...INK);
      doc.text("Attendance Report", margin, margin + 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(`${pretty(from)} — ${pretty(to)}`, margin, margin + 9.5);

      const stamp = `Generated ${new Date().toLocaleString()}`;
      doc.text(stamp, pageW - margin - doc.getTextWidth(stamp), margin + 9.5);
    },
  });

  // Legend under the table, on whatever page it ended on. Clamped into the
  // bottom margin the table already reserves, so a table that runs to the foot
  // of the page never pushes a legend-only page after it.
  const y = Math.min((doc.lastAutoTable?.finalY ?? margin) + 6, pageH - 13);
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("\u2014  non-working day        *  no check-out recorded", margin, y);

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
