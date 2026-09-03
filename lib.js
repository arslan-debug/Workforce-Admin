import { Home, Briefcase, Plane, Sun, Calendar, Stethoscope, Wrench, X } from "lucide-react";

/* ============================================================================
   DESIGN TOKENS
   ========================================================================= */
export const C = {
  bg: "#0A0E13",
  bgPanel: "#0F141B",
  surface: "#141A22",
  surfaceHover: "#1B222C",
  border: "#232C36",
  borderStrong: "#333F4C",
  textPrimary: "#E9EEF3",
  textSecondary: "#8E9CAB",
  textMuted: "#576372",
  ok: "#3DDC97",
  warning: "#F2B84B",
  critical: "#F2793D",
  overdue: "#E5484D",
};

export const CATEGORY_META = {
  SAUDI_BASE: { label: "Saudi Base", color: "#5B9BD5", Icon: Home },
  ON_PROJECT: { label: "On Project", color: "#E8A33D", Icon: Briefcase },
  TRAVEL: { label: "Travel", color: "#9B7EDE", Icon: Plane },
  DAYS_OFF: { label: "Days Off", color: "#3DDC97", Icon: Sun },
  WEEKEND: { label: "Weekend", color: "#6B7785", Icon: Calendar },
  SICK_LEAVE: { label: "Sick Leave", color: "#E8637A", Icon: Stethoscope },
  OTHER_DUTY: { label: "Other Duty", color: "#A68A64", Icon: Wrench },
  BLANK: { label: "No Data", color: "#3A424C", Icon: X },
};

export const ALERT_META = {
  OK: { label: "On Track", color: C.ok, rank: 9 },
  WARNING: { label: "Warning", color: C.warning, rank: 2 },
  CRITICAL: { label: "Critical", color: C.critical, rank: 1 },
  RETURN_SOON: { label: "Return Soon", color: C.critical, rank: 1 },
  OVERDUE: { label: "Overdue", color: C.overdue, rank: 0 },
  RETURN_DUE: { label: "Return Due", color: C.overdue, rank: 0 },
};

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const STATUS_OPTIONS = [
  { code: "", label: "\u2014 No entry" },
  { code: "SJ", label: "SJ \u2014 Saudi Job (On Project)" },
  { code: "SB", label: "SB \u2014 Saudi Base" },
  { code: "DO", label: "DO \u2014 Day Off" },
  { code: "RTD", label: "RTD \u2014 Return / Travel" },
  { code: "TD", label: "TD \u2014 Travel (Other)" },
  { code: "WE", label: "WE \u2014 Weekend" },
  { code: "PH", label: "PH \u2014 Public Holiday" },
  { code: "LOA", label: "LOA \u2014 Leave of Absence" },
  { code: "SL", label: "SL \u2014 Sick Leave" },
  { code: "T", label: "T \u2014 Other Duty" },
];

/* ============================================================================
   DATA PIPELINE — status -> category / phase -> rotation limits -> streak ->
   days remaining -> alert tier -> plain-English trigger. Verified in the
   original build against the source workbook's own computed output.
   ========================================================================= */
const CATEGORY_OF = {
  DO: "DAYS_OFF", V: "DAYS_OFF", LOA: "DAYS_OFF",
  WE: "WEEKEND", PH: "WEEKEND",
  SB: "SAUDI_BASE",
  RTD: "TRAVEL", TD: "TRAVEL",
  SL: "SICK_LEAVE",
  T: "OTHER_DUTY", BT: "OTHER_DUTY", HQ: "OTHER_DUTY", STB: "OTHER_DUTY", WFH: "OTHER_DUTY", QD: "OTHER_DUTY",
  "": "BLANK",
};
export function categoryOf(status) {
  return CATEGORY_OF[status] ?? "ON_PROJECT";
}
export function phaseOf(status) {
  if (status === "DO" || status === "V") return "OFF";
  if (status === "WE" || status === "PH") return "WEEKEND";
  if (status === "") return "BLANK";
  return "WORKING";
}
const ROTATION_RULES = {
  "4X2": { work: 28, off: 14 },
  "2X1": { work: 60, off: 30 },
  "45X30": { work: 45, off: 30 },
  "3X1": { work: 90, off: 30 },
};
export function rotationRule(rotation) {
  const key = (rotation || "").trim().toUpperCase();
  return ROTATION_RULES[key] || { work: 0, off: 0 };
}
export function triggerFor(alert, daysRemaining) {
  switch (alert) {
    case "OVERDUE": return "Send on days off immediately \u2014 rotation exceeded.";
    case "CRITICAL": return `Arrange replacement now \u2014 ${daysRemaining} day(s) remaining.`;
    case "WARNING": return `Start planning \u2014 ${daysRemaining} day(s) remaining in rotation.`;
    case "RETURN_DUE": return "Call back to duty immediately \u2014 days off exceeded.";
    case "RETURN_SOON": return `Confirm return travel \u2014 ${daysRemaining} day(s) of leave remaining.`;
    default: return "Within rotation limits \u2014 no action needed.";
  }
}
export function buildTimeline(daysArr, dateList, rotation) {
  const { work: workDays, off: offDays } = rotationRule(rotation);
  let consecutive = 0;
  let prevPhase = null;
  const rows = [];
  for (let i = 0; i < dateList.length; i++) {
    const status = (daysArr[i] || "").trim().toUpperCase();
    const category = categoryOf(status);
    const phase = phaseOf(status);
    consecutive = phase === prevPhase ? consecutive + 1 : 1;
    prevPhase = phase;

    let daysRemaining = null;
    if (phase === "WORKING" && workDays > 0) daysRemaining = workDays - consecutive;
    else if (phase === "OFF" && offDays > 0) daysRemaining = offDays - consecutive;

    let alert = "OK";
    if (phase === "WORKING" && workDays > 0) {
      if (daysRemaining <= 0) alert = "OVERDUE";
      else if (daysRemaining <= 5) alert = "CRITICAL";
      else if (daysRemaining <= 10) alert = "WARNING";
    } else if (phase === "OFF" && offDays > 0) {
      if (daysRemaining <= 0) alert = "RETURN_DUE";
      else if (daysRemaining <= 5) alert = "RETURN_SOON";
    }

    rows.push({
      date: dateList[i], status, category, phase, consecutive,
      workDays, offDays, daysRemaining, alert,
      trigger: triggerFor(alert, daysRemaining),
    });
  }
  return rows;
}

/* ============================================================================
   DATE HELPERS
   ========================================================================= */
export function cx(...xs) { return xs.filter(Boolean).join(" "); }

export function dateParts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, wd };
}
export function formatDateLabel(iso) {
  const { y, m, d, wd } = dateParts(iso);
  return `${WEEKDAY_NAMES[wd]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
export function formatDateShort(iso) {
  const { y, m, d } = dateParts(iso);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDaysIso(iso, delta) {
  const { y, m, d } = dateParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
/** Rolling window of ISO dates around `centerDate`. Wide enough on the back
 *  side to cover even the longest rotation cycle (90 days) so consecutive-day
 *  counts are accurate no matter which date is currently selected. */
export function buildDateWindow(centerDate, daysBack = 120, daysForward = 60) {
  const start = addDaysIso(centerDate, -daysBack);
  const end = addDaysIso(centerDate, daysForward);
  const dates = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return dates;
}
export function groupDatesByMonth(dateList) {
  const groups = [];
  let current = null;
  dateList.forEach((d) => {
    const key = d.slice(0, 7);
    if (!current || current.key !== key) {
      const { m, y } = dateParts(d);
      current = { key, label: `${MONTH_NAMES[m - 1]} ${y}`, items: [] };
      groups.push(current);
    }
    current.items.push(d);
  });
  return groups;
}

export function localExpatOf(nat) {
  return (nat || "").trim().toUpperCase() === "SAUDI ARABIA" ? "Local" : "Expat";
}
export function uniqueSorted(arr) {
  return [...new Set(arr.filter((v) => v !== "" && v != null))].sort((a, b) => String(a).localeCompare(String(b)));
}
