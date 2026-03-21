export interface HabitSectionMeta {
  key: string;
  label: string;
  icon: string;
}

const DEFAULT_SECTIONS: HabitSectionMeta[] = [
  { key: "morning", label: "Morning Habits", icon: "☀️" },
];

function storageKey(groupId: string | null): string {
  return `habitSections_${groupId || "personal"}`;
}

export function getHabitSections(groupId: string | null): HabitSectionMeta[] {
  try {
    const raw = localStorage.getItem(storageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_SECTIONS];
}

export function setHabitSections(groupId: string | null, sections: HabitSectionMeta[]) {
  try {
    localStorage.setItem(storageKey(groupId), JSON.stringify(sections));
  } catch {}
}
