import { useAuth, Group } from "@/context/AuthContext";
import { Plus } from "lucide-react";

const GroupSelector = ({ onCreateGroup }: { onCreateGroup?: () => void }) => {
  const { groups, activeGroup, setActiveGroup, user } = useAuth();

  if (groups.length === 0) return null;

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";

  const getMemberAvatars = (group: Group) => {
    // Show up to 3 members excluding current user first, then include self
    const others = group.members.filter((m) => m.user_id !== user?.id);
    const self = group.members.find((m) => m.user_id === user?.id);
    const ordered = [...others];
    if (self) ordered.push(self);
    return ordered.slice(0, 3);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-1 px-1">
      {/* All Groups chip */}
      <button
        onClick={() => setActiveGroup(null)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${
          activeGroup === null
            ? "border-primary bg-primary text-primary-foreground shadow-md"
            : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
        }`}
      >
        <span className="text-base">🌐</span>
        <span>All</span>
      </button>

      {/* Group chips */}
      {groups.map((group) => {
        const isActive = activeGroup?.id === group.id;
        const avatars = getMemberAvatars(group);

        return (
          <button
            key={group.id}
            onClick={() => setActiveGroup(group)}
            className={`flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-2xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {/* Member avatar stack */}
            <div className="flex -space-x-2">
              {avatars.map((member, i) => (
                <div
                  key={member.id}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 flex-shrink-0 ${
                    isActive
                      ? "ring-primary bg-primary-foreground/20 text-primary-foreground"
                      : "ring-card bg-secondary text-foreground"
                  }`}
                  style={{ zIndex: avatars.length - i }}
                  title={member.display_name || ""}
                >
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.display_name || ""}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(member.display_name)
                  )}
                </div>
              ))}
            </div>

            <span className="truncate max-w-[120px]">{group.name}</span>

            {group.members.length > 3 && (
              <span className={`text-[10px] font-medium ${isActive ? "text-primary-foreground/70" : "opacity-50"}`}>
                +{group.members.length - 3}
              </span>
            )}
          </button>
        );
      })}

      {/* + New Group chip */}
      {onCreateGroup && (
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-dashed border-border whitespace-nowrap text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex-shrink-0"
        >
          <Plus size={14} />
          <span>New</span>
        </button>
      )}
    </div>
  );
};

export default GroupSelector;
