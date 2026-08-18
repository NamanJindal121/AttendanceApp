import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { statusText } from "./attendance";

// Cell fills mirror the on-screen matrix (and therefore the month calendar),
// so a printed report reads the same as the app.
const FILL = {
  present: [220, 252, 231],
  late: [254, 243, 199],
  halfDay: [255, 237, 213],
  absent: [254, 226, 226],
  off: [241, 245, 249],
  future: [255, 255, 255],
};
const INK = [51, 65, 85];
const BLUE = [37, 99, 235];
const GRAY = [107, 114, 128];

// Which fill a day's status earns. Kept separate from the text so the colour
// and the label can never disagree.
function fillFor(s) {
  if (s.status === "present") {
    if (s.halfDay) return FILL.halfDay;
    if (s.late || s.shortfall) return FILL.late;
    return FILL.present;
  }
  if (s.status === "absent") return FILL.absent;
  if (s.status === "off") return FILL.off;
  return FILL.future;
}

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
  // Past ~6 employees the columns stop fitting a portrait page.
  const landscape = employees.length > 6;
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

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

  // Parallel grid of statuses so didParseCell can colour without re-deriving.
  const kinds = matrix.map((row) => row.cells.map((c) => fillFor(c.status)));

  autoTable(doc, {
    head,
    body,
    foot,
    startY: margin + 14,
    // top applies to continuation pages; without it the table would be drawn
    // over the header band that didDrawPage stamps on every page.
    margin: { top: margin + 14, left: margin, right: margin, bottom: margin + 10 },
    theme: "grid",
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: employees.length > 10 ? 6 : 7,
      cellPadding: 1.6,
      halign: "center",
      valign: "middle",
      textColor: INK,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: BLUE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: employees.length > 10 ? 6 : 7,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: INK,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 22, fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index === 0) return;
      const fill = kinds[data.row.index]?.[data.column.index - 1];
      if (fill) data.cell.styles.fillColor = fill;
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

  // Legend under the table, on whatever page it ended on.
  let y = (doc.lastAutoTable?.finalY ?? margin) + 7;
  if (y > pageH - 18) {
    doc.addPage();
    y = margin + 18;
  }
  const legend = [
    ["Present", FILL.present],
    ["Late", FILL.late],
    ["Half day", FILL.halfDay],
    ["Absent", FILL.absent],
    ["Non-working", FILL.off],
  ];
  let x = margin;
  doc.setFontSize(7.5);
  for (const [text, fill] of legend) {
    doc.setFillColor(...fill);
    doc.setDrawColor(226, 232, 240);
    doc.rect(x, y - 2.6, 3.4, 3.4, "FD");
    doc.setTextColor(...INK);
    doc.text(text, x + 4.6, y);
    x += doc.getTextWidth(text) + 11;
  }
  doc.setTextColor(...GRAY);
  doc.text("*  no check-out recorded", x, y);

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
