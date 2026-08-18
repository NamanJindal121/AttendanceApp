// Pure date helpers behind the report's range picker. Kept out of the
// component so the preset arithmetic can be tested on its own.
import { dayKey } from "./attendance";

export const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d, n) => {
  const x = midnight(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Monday-based start of the week containing d.
export const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));

// Each preset resolves to a [from, to] pair against a given "today". Order
// matches the rail; "Custom" is implicit when the user clicks days directly.
export const PRESETS = [
  { key: "today", label: "Today", range: (t) => [t, t] },
  { key: "yesterday", label: "Yesterday", range: (t) => [addDays(t, -1), addDays(t, -1)] },
  { key: "last7", label: "Last 7 days", range: (t) => [addDays(t, -6), t] },
  {
    key: "lastweek",
    label: "Last week (Mon – Sun)",
    range: (t) => {
      const start = addDays(startOfWeek(t), -7);
      return [start, addDays(start, 6)];
    },
  },
  { key: "last28", label: "Last 28 days", range: (t) => [addDays(t, -27), t] },
  { key: "last30", label: "Last 30 days", range: (t) => [addDays(t, -29), t] },
  {
    key: "thismonth",
    label: "This month",
    range: (t) => [new Date(t.getFullYear(), t.getMonth(), 1), t],
  },
  {
    key: "lastmonth",
    label: "Last month",
    range: (t) => [
      new Date(t.getFullYear(), t.getMonth() - 1, 1),
      new Date(t.getFullYear(), t.getMonth(), 0),
    ],
  },
  { key: "last90", label: "Last 90 days", range: (t) => [addDays(t, -89), t] },
];

// Resolve a preset key to local "YYYY-MM-DD" strings.
export function presetRange(key, today) {
  const p = PRESETS.find((x) => x.key === key);
  if (!p) return null;
  const [a, b] = p.range(midnight(today));
  return [dayKey(a), dayKey(b)];
}

// Every day from `from` to `to` inclusive, as local "YYYY-MM-DD" keys.
export function daysInRange(from, to, cap = 400) {
  const out = [];
  if (!from || !to || from > to) return out;
  const [y, m, d] = from.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  while (dayKey(cur) <= to) {
    out.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
    if (out.length >= cap) break;
  }
  return out;
}
