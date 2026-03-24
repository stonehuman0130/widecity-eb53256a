import { useState, useEffect } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { GripVertical, Eye, EyeOff, X, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import type { HabitSectionMeta } from "@/lib/habitSections";

export interface HomeSection {
  id: string;
  label: string;
  icon: string;
  locked?: boolean;
}

// Core fixed sections (non-habit)
export const FIXED_SECTIONS: HomeSection[] = [
  { id: "scheduled", label: "Scheduled", icon: "🕐", locked: true },
  { id: "todo", label: "To Do List", icon: "✅", locked: true },
  { id: "water", label: "Water Intake", icon: "💧" },
  { id: "nutrition", label: "Nutrition", icon: "🍎" },
  { id: "workout", label: "Today's Workout", icon: "💪" },
  { id: "sobriety", label: "Sobriety Tracker", icon: "🏆" },
  { id: "special-days", label: "Special Days", icon: "❤️" },
];

// Build dynamic ALL_SECTIONS based on user's habit sections
export function buildAllSections(habitSections: HabitSectionMeta[]): HomeSection[] {
  const habitHomeSections: HomeSection[] = habitSections.map((s) => ({
    id: `habit:${s.key}`,
    label: s.label,
    icon: s.icon,
  }));
  return [...habitHomeSections, ...FIXED_SECTIONS];
}

export const DEFAULT_ORDER = ["habit:morning", "scheduled", "todo"];
export const DEFAULT_VISIBLE = new Set(["habit:morning", "scheduled", "todo"]);

function getStorageKey(groupId: string | null) {
  return `homeSections_${groupId || "personal"}`;
}

export interface SectionPrefs {
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
  selectedSpecialDayIds: string[];
}

export function loadSectionPrefs(groupId: string | null): SectionPrefs {
  try {
    const raw = localStorage.getItem(getStorageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old IDs
      const migrateId = (id: string) => {
        if (id === "morning-habits") return "habit:morning";
        if (id === "other-habits") return "habit:other";
        if (id === "justdoit") return "todo";
        return id;
      };
      const order = (parsed.order || DEFAULT_ORDER).map(migrateId);
      const vis = new Set<string>((parsed.visible || DEFAULT_ORDER).map(migrateId));
      vis.add("scheduled");
      vis.add("todo");
      return {
        order,
        visible: vis,
        selectedSobrietyIds: parsed.selectedSobrietyIds || [],
        selectedSpecialDayIds: parsed.selectedSpecialDayIds || [],
      };
    }
  } catch {}
  return { order: [...DEFAULT_ORDER], visible: new Set(DEFAULT_VISIBLE), selectedSobrietyIds: [], selectedSpecialDayIds: [] };
}

export function saveSectionPrefs(
  groupId: string | null,
  order: string[],
  visible: Set<string>,
  selectedSobrietyIds?: string[],
  selectedSpecialDayIds?: string[]
) {
  const vis = new Set(visible);
  vis.add("scheduled");
  vis.add("justdoit");
  const existing = loadSectionPrefs(groupId);
  localStorage.setItem(
    getStorageKey(groupId),
    JSON.stringify({
      order,
      visible: Array.from(vis),
      selectedSobrietyIds: selectedSobrietyIds ?? existing.selectedSobrietyIds,
      selectedSpecialDayIds: selectedSpecialDayIds ?? existing.selectedSpecialDayIds,
    })
  );
}

interface SobrietyOption {
  id: string;
  label: string;
  icon: string;
}

interface SpecialDayOption {
  id: string;
  title: string;
  icon: string;
}

interface SortableSectionRowProps {
  id: string;
  isVisible: boolean;
  children: (startDrag: (e: React.PointerEvent<HTMLButtonElement>) => void) => React.ReactNode;
}

const SortableSectionRow = ({ id, isVisible, children }: SortableSectionRowProps) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragControls={controls}
      dragListener={false}
      className={`rounded-xl border transition-colors ${
        isVisible ? "bg-card border-border shadow-sm" : "bg-secondary/50 border-transparent opacity-60"
      }`}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px hsl(var(--foreground) / 0.14)" }}
    >
      {children((e) => controls.start(e.nativeEvent))}
    </Reorder.Item>
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
  selectedSpecialDayIds: string[];
  onSave: (
    order: string[],
    visible: Set<string>,
    selectedSobrietyIds: string[],
    selectedSpecialDayIds: string[]
  ) => void;
}

const HomeSectionCustomizer = ({
  open,
  onClose,
  order,
  visible,
  selectedSobrietyIds,
  selectedSpecialDayIds,
  onSave,
}: Props) => {
  const { user, activeGroup } = useAuth();
  const { filteredHabits } = useAppContext();
  useModalScrollLock(open);
  const [localOrder, setLocalOrder] = useState<string[]>([...order]);
  const [localVisible, setLocalVisible] = useState<Set<string>>(new Set(visible));
  const [localSobrietyIds, setLocalSobrietyIds] = useState<string[]>([...selectedSobrietyIds]);
  const [localSpecialDayIds, setLocalSpecialDayIds] = useState<string[]>([...selectedSpecialDayIds]);
  const [sobrietyOptions, setSobrietyOptions] = useState<SobrietyOption[]>([]);
  const [specialDayOptions, setSpecialDayOptions] = useState<SpecialDayOption[]>([]);
  const [sobrietyExpanded, setSobrietyExpanded] = useState(false);
  const [specialDaysExpanded, setSpecialDaysExpanded] = useState(false);

  // Build ALL_SECTIONS dynamically from user's habit sections (from context)
  const { habitSections } = useAppContext();
  const ALL_SECTIONS = buildAllSections(habitSections);

  useEffect(() => {
    if (open) {
      setLocalOrder([...order]);
      setLocalVisible(new Set(visible));
      setLocalSobrietyIds([...selectedSobrietyIds]);
      setLocalSpecialDayIds([...selectedSpecialDayIds]);
    }
  }, [open]);

  // Load sobriety categories + special days
  useEffect(() => {
    if (!open || !user) return;

    const load = async () => {
      let sobrietyQuery = supabase.from("sobriety_categories").select("id, label, icon").eq("user_id", user.id);
      let specialDaysQuery = supabase
        .from("special_days")
        .select("id, title, icon")
        .eq("user_id", user.id)
        .order("event_date", { ascending: true });

      if (activeGroup) {
        sobrietyQuery = sobrietyQuery.eq("group_id", activeGroup.id);
        specialDaysQuery = specialDaysQuery.eq("group_id", activeGroup.id);
      } else {
        sobrietyQuery = sobrietyQuery.is("group_id", null);
        specialDaysQuery = specialDaysQuery.is("group_id", null);
      }

      const [{ data: sobrietyData }, { data: specialDaysData }] = await Promise.all([
        sobrietyQuery,
        specialDaysQuery,
      ]);

      if (sobrietyData) setSobrietyOptions(sobrietyData as SobrietyOption[]);
      if (specialDaysData) setSpecialDayOptions(specialDaysData as SpecialDayOption[]);
    };

    load();
  }, [open, user, activeGroup?.id]);

  const fullOrder = (() => {
    const inOrder = new Set(localOrder);
    const result = [...localOrder];
    ALL_SECTIONS.forEach((s) => {
      if (!inOrder.has(s.id)) result.push(s.id);
    });
    return result;
  })();

  const toggleVisible = (id: string) => {
    const section = ALL_SECTIONS.find((s) => s.id === id);
    if (section?.locked) return;
    const next = new Set(localVisible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocalVisible(next);

    let sobrietyIds = localSobrietyIds;
    let specialDayIds = localSpecialDayIds;

    // If enabling sobriety and no trackers selected, select all
    if (id === "sobriety" && next.has("sobriety") && localSobrietyIds.length === 0 && sobrietyOptions.length > 0) {
      sobrietyIds = sobrietyOptions.map((o) => o.id);
      setLocalSobrietyIds(sobrietyIds);
    }

    // If enabling special days and no days selected, select all
    if (id === "special-days" && next.has("special-days") && localSpecialDayIds.length === 0 && specialDayOptions.length > 0) {
      specialDayIds = specialDayOptions.map((o) => o.id);
      setLocalSpecialDayIds(specialDayIds);
    }

    onSave(fullOrder, next, sobrietyIds, specialDayIds);
  };

  const toggleSobrietyTracker = (trackerId: string) => {
    let next: string[];
    if (localSobrietyIds.includes(trackerId)) {
      next = localSobrietyIds.filter((id) => id !== trackerId);
    } else {
      next = [...localSobrietyIds, trackerId];
    }
    setLocalSobrietyIds(next);
    // Auto-enable sobriety section if selecting a tracker
    const vis = new Set(localVisible);
    if (next.length > 0) vis.add("sobriety");
    setLocalVisible(vis);
    onSave(fullOrder, vis, next, localSpecialDayIds);
  };

  const toggleSpecialDay = (dayId: string) => {
    let next: string[];
    if (localSpecialDayIds.includes(dayId)) {
      next = localSpecialDayIds.filter((id) => id !== dayId);
    } else {
      next = [...localSpecialDayIds, dayId];
    }

    setLocalSpecialDayIds(next);

    // Auto-enable special days section if selecting any day
    const vis = new Set(localVisible);
    if (next.length > 0) vis.add("special-days");
    setLocalVisible(vis);
    onSave(fullOrder, vis, localSobrietyIds, next);
  };

  const handleReorder = (newOrder: string[]) => {
    setLocalOrder(newOrder);
    const computedFull = (() => {
      const inOrder = new Set(newOrder);
      const result = [...newOrder];
      ALL_SECTIONS.forEach((s) => {
        if (!inOrder.has(s.id)) result.push(s.id);
      });
      return result;
    })();
    onSave(computedFull, localVisible, localSobrietyIds, localSpecialDayIds);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center pb-[env(safe-area-inset-bottom)] overscroll-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[min(82svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
        >
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-b border-border px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-display">Customize Home</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
              <X size={16} />
            </button>
          </div>
          <p className="px-5 text-xs text-muted-foreground mb-4">
            Toggle sections on/off and drag with the grip handle to reorder. Changes apply instantly.
          </p>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-scroll px-5 pb-[max(env(safe-area-inset-bottom),1rem)] overscroll-y-contain"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain" }}
          >
            <Reorder.Group
              axis="y"
              values={fullOrder}
              onReorder={handleReorder}
              layoutScroll
              className="space-y-2 touch-pan-y"
            >
              {fullOrder.map((id) => {
                const section = ALL_SECTIONS.find((s) => s.id === id);
                if (!section) return null;
                const isVisible = localVisible.has(id);
                const isLocked = section.locked;
                const isSobriety = id === "sobriety";
                const isSpecialDays = id === "special-days";

                return (
                  <SortableSectionRow
                    key={id}
                    id={id}
                    isVisible={isVisible}
                  >
                    {(startDrag) => (
                      <>
                        <div className="flex items-center gap-2.5 px-3 py-3">
                          <button
                            onPointerDown={startDrag}
                            className="w-8 h-8 rounded-lg bg-secondary/70 text-muted-foreground flex items-center justify-center touch-none"
                            aria-label={`Reorder ${section.label}`}
                          >
                            <GripVertical size={16} className="flex-shrink-0" />
                          </button>
                          <span className="text-base">{section.icon}</span>
                          <span className="flex-1 text-sm font-semibold">{section.label}</span>
                          {(isSobriety && isVisible && sobrietyOptions.length > 0) && (
                            <button
                              onClick={() => setSobrietyExpanded(!sobrietyExpanded)}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground"
                              aria-label="Expand sobriety tracker selection"
                            >
                              {sobrietyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          {(isSpecialDays && isVisible && specialDayOptions.length > 0) && (
                            <button
                              onClick={() => setSpecialDaysExpanded(!specialDaysExpanded)}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground"
                              aria-label="Expand special days selection"
                            >
                              {specialDaysExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          {isLocked ? (
                            <Lock size={14} className="text-muted-foreground" />
                          ) : (
                            <button
                              onClick={() => toggleVisible(id)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                isVisible ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                          )}
                        </div>

                        {isSobriety && isVisible && sobrietyExpanded && sobrietyOptions.length > 0 && (
                          <div className="px-3 pb-3 space-y-1.5 ml-11">
                            {sobrietyOptions.map((opt) => {
                              const selected = localSobrietyIds.includes(opt.id);
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => toggleSobrietyTracker(opt.id)}
                                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                                    selected
                                      ? "bg-primary/10 border border-primary/20"
                                      : "bg-secondary/50 border border-transparent"
                                  }`}
                                >
                                  <span className="text-sm">{opt.icon}</span>
                                  <span className="flex-1 text-xs font-medium">{opt.label}</span>
                                  {selected ? (
                                    <Eye size={13} className="text-primary" />
                                  ) : (
                                    <EyeOff size={13} className="text-muted-foreground" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {isSpecialDays && isVisible && specialDaysExpanded && specialDayOptions.length > 0 && (
                          <div className="px-3 pb-3 space-y-1.5 ml-11">
                            {specialDayOptions.map((opt) => {
                              const selected = localSpecialDayIds.includes(opt.id);
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => toggleSpecialDay(opt.id)}
                                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                                    selected
                                      ? "bg-primary/10 border border-primary/20"
                                      : "bg-secondary/50 border border-transparent"
                                  }`}
                                >
                                  <span className="text-sm">{opt.icon}</span>
                                  <span className="flex-1 text-xs font-medium truncate">{opt.title}</span>
                                  {selected ? (
                                    <Eye size={13} className="text-primary" />
                                  ) : (
                                    <EyeOff size={13} className="text-muted-foreground" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </SortableSectionRow>
                );
              })}
            </Reorder.Group>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default HomeSectionCustomizer;
