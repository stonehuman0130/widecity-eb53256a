export type EventType = "birthday" | "anniversary" | "first_met" | "wedding" | "holiday" | "custom";
export type DisplayMode = "auto" | "countdown" | "days_since" | "days_together" | "annual_countdown";

export interface SpecialDay {
  id: string;
  title: string;
  icon: string;
  event_date: string;
  count_direction: "since" | "until";
  repeats_yearly: boolean;
  is_featured: boolean;
  group_id: string | null;
  user_id: string;
  photo_url: string | null;
  category: string;
  notes: string | null;
  reminder_minutes: number | null;
  event_type: EventType;
  display_mode: DisplayMode;
}

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string; icon: string; defaultDirection: "since" | "until"; defaultRepeats: boolean }[] = [
  { value: "birthday", label: "Birthday", icon: "🎂", defaultDirection: "until", defaultRepeats: true },
  { value: "anniversary", label: "Anniversary", icon: "💍", defaultDirection: "since", defaultRepeats: true },
  { value: "first_met", label: "First Met", icon: "💕", defaultDirection: "since", defaultRepeats: false },
  { value: "wedding", label: "Wedding", icon: "💒", defaultDirection: "since", defaultRepeats: true },
  { value: "holiday", label: "Holiday", icon: "🎄", defaultDirection: "until", defaultRepeats: true },
  { value: "custom", label: "Custom", icon: "⭐", defaultDirection: "until", defaultRepeats: false },
];

export const ICON_OPTIONS = ["❤️", "💍", "🎂", "🎉", "🏆", "⭐", "🌹", "💐", "🥂", "👶", "🎓", "✈️", "🏠", "💪", "🙏", "🎊"];

export const CATEGORY_OPTIONS = [
  { value: "birthday", label: "Birthday", icon: "🎂" },
  { value: "anniversary", label: "Anniversary", icon: "💍" },
  { value: "family", label: "Family", icon: "👨‍👩‍👧" },
  { value: "holiday", label: "Holiday", icon: "🎄" },
  { value: "custom", label: "Custom", icon: "⭐" },
];

export const REMINDER_OPTIONS = [
  { value: 0, label: "On the day" },
  { value: 10080, label: "1 week before" },
  { value: -1, label: "Custom" },
];

export const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function daysBetween(a: Date, b: Date) {
  const msPerDay = 86400000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

export function getNextOccurrence(dateStr: string, now: Date) {
  const d = new Date(dateStr + "T00:00:00");
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear >= now) return daysBetween(now, thisYear);
  const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return daysBetween(now, nextYear);
}

export function getAge(dateStr: string, now: Date): number {
  const d = new Date(dateStr + "T00:00:00");
  let age = now.getFullYear() - d.getFullYear();
  const thisYearBday = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (now < thisYearBday) age--;
  return age;
}

export function getNextBirthdayAge(dateStr: string, now: Date): number {
  const d = new Date(dateStr + "T00:00:00");
  const thisYearBday = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYearBday >= now) {
    return now.getFullYear() - d.getFullYear();
  }
  return now.getFullYear() + 1 - d.getFullYear();
}

export function getDayCount(day: SpecialDay, now: Date) {
  const eventDate = new Date(day.event_date + "T00:00:00");
  if (day.event_type === "birthday" || (day.repeats_yearly && day.count_direction === "until")) {
    return getNextOccurrence(day.event_date, now);
  }
  if (day.count_direction === "since") {
    return Math.max(0, daysBetween(eventDate, now));
  }
  if (day.repeats_yearly) {
    return getNextOccurrence(day.event_date, now);
  }
  return Math.max(0, daysBetween(now, eventDate));
}

export function getDisplayLabel(day: SpecialDay, now: Date): { primary: string; secondary: string } {
  const count = getDayCount(day, now);
  const eventDate = new Date(day.event_date + "T00:00:00");

  if (day.event_type === "birthday") {
    if (count === 0) {
      const age = getAge(day.event_date, now);
      return { primary: "Today! 🎉", secondary: `Turns ${age} today` };
    }
    const nextAge = getNextBirthdayAge(day.event_date, now);
    return {
      primary: `${count.toLocaleString()} days to go`,
      secondary: `Turning ${nextAge}`,
    };
  }

  if (day.event_type === "anniversary" || day.event_type === "first_met" || day.event_type === "wedding") {
    const daysSince = daysBetween(eventDate, now);
    if (day.repeats_yearly) {
      const nextOcc = getNextOccurrence(day.event_date, now);
      if (nextOcc === 0) {
        const years = now.getFullYear() - eventDate.getFullYear();
        return { primary: "Today! 🎉", secondary: `${years} years together` };
      }
      return {
        primary: `${daysSince.toLocaleString()} days together`,
        secondary: `Next in ${nextOcc} days`,
      };
    }
    return {
      primary: `${daysSince.toLocaleString()} days together`,
      secondary: "",
    };
  }

  // Custom / Holiday / general
  if (day.count_direction === "since") {
    return { primary: `${count.toLocaleString()} days ago`, secondary: "" };
  }
  if (day.repeats_yearly) {
    return { primary: `${count.toLocaleString()} days to go`, secondary: "Repeats yearly" };
  }
  return { primary: `${count.toLocaleString()} days to go`, secondary: "" };
}

export function getUpcomingMilestones(startDate: Date, now: Date) {
  const daysSince = daysBetween(startDate, now);
  const milestones: { label: string; daysLeft: number }[] = [];
  for (let y = 1; y <= 100; y++) {
    const milestone = new Date(startDate);
    milestone.setFullYear(milestone.getFullYear() + y);
    const left = daysBetween(now, milestone);
    if (left > 0 && left <= 730) {
      milestones.push({ label: `${y} ${y === 1 ? "year" : "years"}`, daysLeft: left });
    }
  }
  [100, 200, 365, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].forEach((d) => {
    const left = d - daysSince;
    if (left > 0 && left <= 365) {
      milestones.push({ label: `${d} days`, daysLeft: left });
    }
  });
  return milestones.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 4);
}
