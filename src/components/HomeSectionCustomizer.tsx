import { useState, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { GripVertical, Eye, EyeOff, X, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface HomeSection {
  id: string;
  label: string;
  icon: string;
  locked?: boolean;
}

export const ALL_SECTIONS: HomeSection[] = [
  { id: "morning-habits", label: "Morning Habits", icon: "🌅" },
  { id: "scheduled", label: "Scheduled", icon: "🕐", locked: true },
  { id: "justdoit", label: "Just Do It", icon: "⚡", locked: true },
  { id: "other-habits", label: "Other Habits", icon: "🌙" },
  { id: "water", label: "Water Intake", icon: "💧" },
  { id: "workout", label: "Today's Workout", icon: "💪" },
  { id: "sobriety", label: "Sobriety Tracker", icon: "🏆" },
];

export const DEFAULT_ORDER = ["morning-habits", "scheduled", "justdoit"];
export const DEFAULT_VISIBLE = new Set(["morning-habits", "scheduled", "justdoit"]);

function getStorageKey(groupId: string | null) {
  return `homeSections_${groupId || "personal"}`;
}

export interface SectionPrefs {
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
}

export function loadSectionPrefs(groupId: string | null): SectionPrefs {
  try {
    const raw = localStorage.getItem(getStorageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      const vis = new Set<string>(parsed.visible || DEFAULT_ORDER);
      vis.add("scheduled");
      vis.add("justdoit");
      return {
        order: parsed.order || [...DEFAULT_ORDER],
        visible: vis,
        selectedSobrietyIds: parsed.selectedSobrietyIds || [],
      };
    }
  } catch {}
  return { order: [...DEFAULT_ORDER], visible: new Set(DEFAULT_VISIBLE), selectedSobrietyIds: [] };
}

export function saveSectionPrefs(
  groupId: string | null,
  order: string[],
  visible: Set<string>,
  selectedSobrietyIds?: string[]
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
    })
  );
}

interface SobrietyOption {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
  onSave: (order: string[], visible: Set<string>, selectedSobrietyIds: string[]) => void;
}

const HomeSectionCustomizer = ({ open, onClose, order, visible, selectedSobrietyIds, onSave }: Props) => {
  const { user, activeGroup } = useAuth();
  const [localOrder, setLocalOrder] = useState<string[]>([...order]);
  const [localVisible, setLocalVisible] = useState<Set<string>>(new Set(visible));
  const [localSobrietyIds, setLocalSobrietyIds] = useState<string[]>([...selectedSobrietyIds]);
  const [sobrietyOptions, setSobrietyOptions] = useState<SobrietyOption[]>([]);
  const [sobrietyExpanded, setSobrietyExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalOrder([...order]);
      setLocalVisible(new Set(visible));
      setLocalSobrietyIds([...selectedSobrietyIds]);
    }
  }, [open, order, visible, selectedSobrietyIds]);

  // Load sobriety categories
  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      let q = supabase.from("sobriety_categories").select("id, label, icon").eq("user_id", user.id);
      if (activeGroup) q = q.eq("group_id", activeGroup.id);
      else q = q.is("group_id", null);
      const { data } = await q;
      if (data) setSobrietyOptions(data as SobrietyOption[]);
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

    let ids = localSobrietyIds;
    // If enabling sobriety and no trackers selected, select all
    if (id === "sobriety" && next.has("sobriety") && localSobrietyIds.length === 0 && sobrietyOptions.length > 0) {
      ids = sobrietyOptions.map((o) => o.id);
      setLocalSobrietyIds(ids);
    }
    onSave(fullOrder, next, ids);
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
    onSave(fullOrder, vis, next);
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
    onSave(computedFull, localVisible, localSobrietyIds);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[80vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold tracking-display">Customize Home</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
              <X size={16} />
            </button>
          </div>
          <p className="px-5 text-xs text-muted-foreground mb-4">
            Toggle sections on/off and drag to reorder. Changes apply instantly.
          </p>

          <div className="flex-1 overflow-y-auto px-5 pb-5 overscroll-contain">
            <Reorder.Group axis="y" values={fullOrder} onReorder={handleReorder} className="space-y-2">
              {fullOrder.map((id) => {
                const section = ALL_SECTIONS.find((s) => s.id === id);
                if (!section) return null;
                const isVisible = localVisible.has(id);
                const isLocked = section.locked;
                const isSobriety = id === "sobriety";

                return (
                  <Reorder.Item
                    key={id}
                    value={id}
                    className={`rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
                      isVisible ? "bg-card border-border shadow-sm" : "bg-secondary/50 border-transparent opacity-60"
                    }`}
                    whileDrag={{ scale: 1.03, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <GripVertical size={16} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-base">{section.icon}</span>
                      <span className="flex-1 text-sm font-semibold">{section.label}</span>
                      {isSobriety && isVisible && sobrietyOptions.length > 0 && (
                        <button
                          onClick={() => setSobrietyExpanded(!sobrietyExpanded)}
                          className="w-6 h-6 flex items-center justify-center text-muted-foreground"
                        >
                          {sobrietyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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

                    {/* Sobriety sub-items */}
                    {isSobriety && isVisible && sobrietyExpanded && sobrietyOptions.length > 0 && (
                      <div className="px-3 pb-3 space-y-1.5 ml-8">
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
                  </Reorder.Item>
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
