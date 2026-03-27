import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Settings, Users, Loader2, X, Check, Camera, Compass } from "lucide-react";
import { Group, useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LauncherPageProps {
  onEnterGroup: (groupId: string | null) => void;
  onCreateGroup?: () => void;
  onOpenSettings?: () => void;
}

const INVITE_CODE_REGEX = /^[A-Za-z0-9]{6,10}$/;

type InviteState =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "found"; groupName: string; code: string }
  | { type: "already_member"; groupName: string }
  | { type: "invalid" }
  | { type: "joining" }
  | { type: "joined"; groupName: string; groupId: string };

// Soft gradient palettes for cards without cover images
const CARD_GRADIENTS = [
  "from-[hsl(210,30%,95%)] to-[hsl(220,25%,92%)]",
  "from-[hsl(260,25%,95%)] to-[hsl(270,20%,91%)]",
  "from-[hsl(35,30%,95%)] to-[hsl(25,25%,92%)]",
  "from-[hsl(170,25%,94%)] to-[hsl(180,20%,91%)]",
  "from-[hsl(340,25%,95%)] to-[hsl(350,20%,92%)]",
];

const LauncherPage = ({ onEnterGroup, onCreateGroup, onOpenSettings }: LauncherPageProps) => {
  const { user, profile, groups, joinGroup, refreshGroups } = useAuth();
  const [inviteState, setInviteState] = useState<InviteState>({ type: "idle" });
  const [fallbackGroups, setFallbackGroups] = useState<Group[]>([]);
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const pendingGroupIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const visibleGroups = useMemo(() => (groups.length > 0 ? groups : fallbackGroups), [groups, fallbackGroups]);

  useEffect(() => {
    if (!user || groups.length > 0) {
      setFallbackGroups([]);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let intervalId: number | undefined;

    const loadFallbackGroups = async () => {
      if (inFlight) return;
      inFlight = true;

      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, type, emoji, invite_code, created_by, cover_image_url");

        if (!error && data) {
          if (!cancelled) {
            setFallbackGroups(
              data.map((g: any) => ({
                id: g.id,
                name: g.name,
                type: g.type,
                emoji: g.emoji,
                invite_code: g.invite_code,
                created_by: g.created_by,
                cover_image_url: g.cover_image_url || null,
                members: [],
              }))
            );
          }
          inFlight = false;
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }

      inFlight = false;
    };

    void loadFallbackGroups();
    intervalId = window.setInterval(() => {
      void loadFallbackGroups();
    }, 10000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [user, groups.length]);

  const handleCoverUpload = async (groupId: string, file: File) => {
    setUploadingGroupId(groupId);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${groupId}/cover.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("group-covers")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("group-covers")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + "?t=" + Date.now();

      // Update group record
      await supabase
        .from("groups")
        .update({ cover_image_url: publicUrl })
        .eq("id", groupId);

      await refreshGroups();
    } catch (err) {
      console.error("Error uploading cover image:", err);
    } finally {
      setUploadingGroupId(null);
    }
  };

  const triggerFileInput = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    pendingGroupIdRef.current = groupId;
    setUploadingGroupId(groupId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const groupId = pendingGroupIdRef.current;
    if (file && groupId) {
      handleCoverUpload(groupId, file);
    }
    e.target.value = "";
  };

  const checkInviteCode = async (code: string) => {
    setInviteState({ type: "checking" });
    try {
      const { data: group } = await supabase
        .from("groups")
        .select("id, name, invite_code")
        .eq("invite_code", code.toUpperCase())
        .maybeSingle();

      if (!group) {
        setInviteState({ type: "invalid" });
        return;
      }

      const alreadyMember = visibleGroups.some((g) => g.id === group.id);
      if (alreadyMember) {
        setInviteState({ type: "already_member", groupName: group.name });
        return;
      }

      setInviteState({ type: "found", groupName: group.name, code: code.toUpperCase() });
    } catch {
      setInviteState({ type: "invalid" });
    }
  };

  const handleJoinGroup = async () => {
    if (inviteState.type !== "found") return;
    const { code } = inviteState;
    setInviteState({ type: "joining" });

    const result = await joinGroup(code);
    if (result.error) {
      setInviteState({ type: "invalid" });
      return;
    }

    await refreshGroups();

    const { data: group } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    setInviteState({ type: "joined", groupName: result.group_name || group?.name || "Group", groupId: group?.id || "" });
  };

  const dismissInvite = () => {
    setInviteState({ type: "idle" });
  };

  return (
    <div className="px-5 flex flex-col min-h-[calc(100svh-1rem)]">
      {/* Hidden file input for cover uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <header className="pt-14 pb-2 flex items-start justify-between gap-3">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[2rem] font-bold tracking-tight leading-tight"
        >
          {greeting},{" "}
          <span className="bg-gradient-to-r from-primary to-[hsl(var(--accent))] bg-clip-text text-transparent">
            {profile?.display_name || "there"}
          </span>
        </motion.h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center justify-center transition-all shadow-sm"
          >
            <Settings size={17} />
          </button>
        )}
      </header>

      {/* Featured Banner / Discover Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6"
      >
        <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-5 pb-4">
          {/* Abstract decorative lines */}
          <svg
            className="absolute top-0 right-0 w-48 h-32 opacity-[0.12]"
            viewBox="0 0 200 130"
            fill="none"
          >
            <circle cx="160" cy="30" r="4" fill="hsl(var(--primary))" />
            <circle cx="140" cy="60" r="6" fill="hsl(var(--primary))" />
            <circle cx="180" cy="70" r="3" fill="hsl(var(--muted-foreground))" />
            <circle cx="120" cy="40" r="5" fill="hsl(var(--muted-foreground))" />
            <circle cx="100" cy="80" r="3.5" fill="hsl(var(--primary))" />
            <circle cx="170" cy="100" r="4" fill="hsl(var(--muted-foreground))" />
            <circle cx="130" cy="90" r="2.5" fill="hsl(var(--primary))" />
            <line x1="160" y1="30" x2="140" y2="60" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="140" y1="60" x2="120" y2="40" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="140" y1="60" x2="180" y2="70" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="120" y1="40" x2="100" y2="80" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="180" y1="70" x2="170" y2="100" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="100" y1="80" x2="130" y2="90" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="130" y1="90" x2="170" y2="100" stroke="hsl(var(--border))" strokeWidth="1" />
          </svg>

          <p className="text-sm font-semibold uppercase tracking-wider text-foreground mb-2 relative z-10">
            Explore Curated Connections
          </p>
          <p className="text-xs text-muted-foreground mb-4 max-w-[70%] relative z-10">
            Connect with your networks in new ways.
          </p>
          <button className="relative z-10 px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80 transition-all border border-border">
            Discover
          </button>
        </div>
      </motion.div>

      {/* Invite Code Banners */}
      <AnimatePresence mode="wait">
        {inviteState.type !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3"
          >
            {inviteState.type === "checking" && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border">
                <Loader2 size={18} className="text-primary animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Checking invite code…</p>
              </div>
            )}

            {inviteState.type === "found" && (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Join "{inviteState.groupName}"?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">This invite code matches a group.</p>
                  </div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
                <div className="flex gap-2 mt-3 ml-[52px]">
                  <button onClick={handleJoinGroup} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.97]">Join Group</button>
                  <button onClick={dismissInvite} className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">Cancel</button>
                </div>
              </div>
            )}

            {inviteState.type === "joining" && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border">
                <Loader2 size={18} className="text-primary animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Joining group…</p>
              </div>
            )}

            {inviteState.type === "joined" && (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0"><Check size={18} className="text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">You've joined "{inviteState.groupName}"!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">It's now in your calendars below.</p>
                  </div>
                </div>
                <div className="mt-3 ml-[52px]">
                  <button onClick={() => { if (inviteState.type === "joined" && inviteState.groupId) onEnterGroup(inviteState.groupId); dismissInvite(); }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.97]">Open Group</button>
                </div>
              </div>
            )}

            {inviteState.type === "already_member" && (
              <div className="p-4 rounded-2xl bg-secondary border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0"><Users size={18} className="text-muted-foreground" /></div>
                  <div className="flex-1"><p className="text-sm font-semibold">Already a member</p><p className="text-xs text-muted-foreground mt-0.5">You're already in "{inviteState.groupName}".</p></div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
              </div>
            )}

            {inviteState.type === "invalid" && (
              <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0"><X size={18} className="text-destructive" /></div>
                  <div className="flex-1"><p className="text-sm font-semibold">Invalid invite code</p><p className="text-xs text-muted-foreground mt-0.5">That code doesn't match any group.</p></div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Calendars */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 flex-1 pb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            My Calendars
          </p>
          {onCreateGroup && (
            <button
              onClick={onCreateGroup}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={12} />
              New
            </button>
          )}
        </div>

        <div className="space-y-3">
          {visibleGroups.map((group, index) => {
            const otherMembers = group.members.filter((m) => m.user_id !== profile?.id);
            const memberNames = otherMembers.map((m) => m.display_name || "Member").join(", ");
            const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
            const hasCover = !!group.cover_image_url;
            const isUploading = uploadingGroupId === group.id;

            return (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + index * 0.06 }}
                className="relative overflow-hidden rounded-2xl shadow-sm border border-border/60"
              >
                <button
                  onClick={() => onEnterGroup(group.id)}
                  className="w-full flex items-center gap-0 text-left group relative"
                >
                  {/* Left content area */}
                  <div className={`flex-1 min-w-0 p-4 pr-2 bg-gradient-to-r ${gradient} min-h-[80px] flex flex-col justify-center`}>
                    {/* Emoji badge */}
                    <div className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur-sm border border-border/40 flex items-center justify-center text-xl mb-2 shadow-sm">
                      {group.emoji}
                    </div>
                    <p className="text-[15px] font-semibold truncate text-foreground leading-tight">
                      {group.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {memberNames || "Just you"} · {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Right image/visual area */}
                  <div className="relative w-[130px] h-[96px] flex-shrink-0 overflow-hidden">
                    {hasCover ? (
                      <img
                        src={group.cover_image_url!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                        <span className="text-4xl opacity-30">{group.emoji}</span>
                      </div>
                    )}
                    {/* Soft fade from left */}
                    <div className={`absolute inset-y-0 left-0 w-8 bg-gradient-to-r ${gradient.split(" ")[0].replace("from-", "from-")} to-transparent`} />
                    
                    {/* Chevron */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <ChevronRight size={16} className="text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </button>

                {/* Camera upload button */}
                <button
                  onClick={(e) => triggerFileInput(group.id, e)}
                  className="absolute bottom-2 right-8 w-7 h-7 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all shadow-sm z-10"
                  aria-label="Upload cover photo"
                >
                  {isUploading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Camera size={12} />
                  )}
                </button>
              </motion.div>
            );
          })}

          {visibleGroups.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">No calendars yet</p>
              {onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Create your first calendar
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LauncherPage;
