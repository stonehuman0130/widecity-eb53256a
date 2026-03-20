import { useState, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { GripVertical, Eye, EyeOff, X, Lock } from "lucide-react";

export interface HomeSection {
  id: string;
  label: string;
  icon: string;
  locked?: boolean; // Scheduled & Just Do It cannot be removed
}

export const ALL_SECTIONS: HomeSection[] = [
  { id: "morning-habits", label: "Morning Habits", icon: "🌅" },
  { id: "scheduled", label: "Scheduled", icon: "🕐", locked: true },
  { id: "justdoit", label: "Just Do It", icon: "⚡", locked: true },
  { id: "water", label: "Water Intake", icon: "💧" },
  { id: "workout", label: "Today's Workout", icon: "💪" },
  { id: "sobriety", label: "Sobriety Tracker", icon: "🏆" },
];

export const DEFAULT_ORDER = ["morning-habits", "scheduled", "justdoit"];
export const DEFAULT_VISIBLE = new Set(["morning-habits", "scheduled", "justdoit"]);

function getStorageKey(groupId: string | null) {
  return `homeSections_${groupId || "personal"}`;
}

export function loadSectionPrefs(groupId: string | null): { order: string[]; visible: Set<string> } {
  try {
    const raw = localStorage.getItem(getStorageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        order: parsed.order || DEFAULT_ORDER,
        visible: new Set(parsed.visible || DEFAULT_ORDER),
      };
    }
  } catch {}
  return { order: [...DEFAULT_ORDER], visible: new Set(DEFAULT_VISIBLE) };
}

export function saveSectionPrefs(groupId: string | null, order: string[], visible: Set<string>) {
  // Always ensure locked sections are visible
  const vis = new Set(visible);
  vis.add("scheduled");
  vis.add("justdoit");
  localStorage.setItem(getStorageKey(groupId), JSON.stringify({ order, visible: Array.from(vis) }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: string[];
  visible: Set<string>;
  onSave: (order: string[], visible: Set<string>) => void;
}

const HomeSectionCustomizer = ({ open, onClose, order, visible, onSave }: Props) => {
  const [localOrder, setLocalOrder] = useState<string[]>([...order]);
  const [localVisible, setLocalVisible] = useState<Set<string>>(new Set(visible));

  // Re-sync local state whenever the modal opens
  useEffect(() => {
    if (open) {
      setLocalOrder([...order]);
      setLocalVisible(new Set(visible));
    }
  }, [open, order, visible]);

  // Ensure all sections appear in order list (new ones get appended)
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
  };

  const handleSave = () => {
    onSave(fullOrder, localVisible);
    onClose();
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
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold tracking-display">Customize Home</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
              <X size={16} />
            </button>
          </div>
          <p className="px-5 text-xs text-muted-foreground mb-4">
            Toggle sections on/off and drag to reorder. Scheduled & Just Do It are always shown.
          </p>

          {/* Sections list */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 overscroll-contain">
            <Reorder.Group
              axis="y"
              values={fullOrder}
              onReorder={(newOrder) => setLocalOrder(newOrder)}
              className="space-y-2"
            >
              {fullOrder.map((id) => {
                const section = ALL_SECTIONS.find((s) => s.id === id);
                if (!section) return null;
                const isVisible = localVisible.has(id);
                const isLocked = section.locked;

                return (
                  <Reorder.Item
                    key={id}
                    value={id}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
                      isVisible
                        ? "bg-card border-border shadow-sm"
                        : "bg-secondary/50 border-transparent opacity-60"
                    }`}
                    whileDrag={{ scale: 1.03, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                  >
                    <GripVertical size={16} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-base">{section.icon}</span>
                    <span className="flex-1 text-sm font-semibold">{section.label}</span>
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
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          {/* Save */}
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={handleSave}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-transform"
            >
              Save Layout
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default HomeSectionCustomizer;
