import { useState, useEffect } from "react";
import { User, Bell, Shield, Palette, HelpCircle, LogOut, ChevronRight, Link2, Copy, Check, Unlink, Loader2, Calendar, ExternalLink, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import GroupManager from "@/components/GroupManager";
import HealthSyncSettings from "@/components/HealthSyncSettings";

const settingsItems = [
  { icon: Bell, label: "Notifications", desc: "Reminders & alerts" },
  { icon: Shield, label: "Privacy", desc: "Data & sharing" },
  { icon: Palette, label: "Appearance", desc: "Theme & display" },
  { icon: HelpCircle, label: "Help & Support", desc: "FAQ & contact" },
];

const SettingsPage = () => {
  const { user, session, profile, partner, groups, activeGroup, setActiveGroup, signOut, connectPartner, disconnectPartner } = useAuth();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);

  // Settings should always be scoped to a specific group
  useEffect(() => {
    if (!activeGroup && groups.length > 0) {
      setActiveGroup(groups[0]);
    }
  }, [activeGroup, groups, setActiveGroup]);

  // Check if Google Calendar is connected for active group
  useEffect(() => {
    if (!user || !activeGroup) {
      setGcalConnected(false);
      return;
    }

    const checkGcal = async () => {
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("id")
        .eq("user_id", user.id)
        .eq("group_id", activeGroup.id)
        .maybeSingle();
      setGcalConnected(!!data);
    };
    checkGcal();

    // Check URL for gcal=connected redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      setGcalConnected(true);
      toast.success("Google Calendar connected! 🎉");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [user, activeGroup]);

  const handleCopyCode = () => {
    if (profile?.invite_code) {
      navigator.clipboard.writeText(profile.invite_code);
      setCodeCopied(true);
      toast.success("Invite code copied!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleConnect = async () => {
    if (!inviteInput.trim()) return;
    setConnecting(true);
    const result = await connectPartner(inviteInput.trim());
    if (result.success) {
      toast.success(`Connected with ${result.partner_name}! 🎉`);
      setShowPartnerDialog(false);
      setInviteInput("");
    } else {
      toast.error(result.error || "Failed to connect");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    const result = await disconnectPartner();
    if (result.success) {
      toast.success("Partner disconnected");
    } else {
      toast.error(result.error || "Failed to disconnect");
    }
  };

  const handleConnectGoogleCalendar = async () => {
    if (!user || !activeGroup) return;
    setGcalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
        body: { group_id: activeGroup.id },
      });
      if (error || !data?.url) throw error || new Error("No URL returned");
      window.location.href = data.url;
    } catch (err) {
      toast.error("Failed to start Google Calendar connection");
      setGcalLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!activeGroup) return;
    setGcalLoading(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-disconnect", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { group_id: activeGroup.id },
      });
      if (error) throw error;
      setGcalConnected(false);
      toast.success("Google Calendar disconnected");
    } catch (err: any) {
      toast.error("Failed to disconnect Google Calendar");
    }
    setGcalLoading(false);
  };

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";
  const partnerInitial = partner?.display_name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="px-5">
      <header className="pt-12 pb-6">
        <h1 className="text-[1.75rem] font-bold tracking-display">Settings</h1>
      </header>


      {/* Profile Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{profile?.display_name || "You"}</p>
          <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
        </div>
        {partner && (
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold">
            {partnerInitial}
          </div>
        )}
      </div>

      {/* Groups / Calendars - FIRST */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3 px-1">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-semibold">My Groups & Calendars</span>
        </div>
        <GroupManager />
      </div>

      {/* Selected Group Details */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        {activeGroup ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{activeGroup.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{activeGroup.name}</p>
                <p className="text-xs text-muted-foreground">{activeGroup.members.length} member{activeGroup.members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-secondary rounded-lg px-3 py-2.5 text-center">
                <span className="text-xs text-muted-foreground block">Group Invite Code</span>
                <span className="text-lg font-bold tracking-widest">{activeGroup.invite_code || "..."}</span>
              </div>
              <button
                onClick={() => {
                  if (!activeGroup.invite_code) return;
                  navigator.clipboard.writeText(activeGroup.invite_code);
                  toast.success("Group invite code copied!");
                }}
                className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Copy size={18} />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Members</p>
              <div className="space-y-2">
                {activeGroup.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {member.display_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.display_name || "Member"}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email || ""}</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase bg-card px-2 py-0.5 rounded">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Select a group above to view its settings.</p>
          </div>
        )}
      </div>

      {/* Google Calendar Integration (group-specific) */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={16} className="text-primary" />
            <span className="text-sm font-semibold">Google Calendar Sync</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {activeGroup
              ? `Connect Google Calendar for ${activeGroup.name} only.`
              : "Select a group in My Groups & Calendars to manage Google Calendar sync."}
          </p>

          {!activeGroup ? (
            <div className="p-3 rounded-xl bg-secondary text-xs text-muted-foreground">
              Pick a group above to view integration status.
            </div>
          ) : gcalConnected === null ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : gcalConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-xl">📅</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Connected</p>
                  <p className="text-xs text-muted-foreground">Syncing for this group only</p>
                </div>
                <Check size={16} className="text-primary" />
              </div>
              <button
                onClick={handleDisconnectGoogleCalendar}
                disabled={gcalLoading}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {gcalLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
                Disconnect Google Calendar
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogleCalendar}
              disabled={gcalLoading}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Connect Google Calendar</p>
                <p className="text-xs opacity-80">Enable sync for this selected group</p>
              </div>
              {gcalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Health & Device Sync */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden p-4">
        <HealthSyncSettings />
      </div>

      {/* Settings List */}
      <div className="space-y-1">
        {settingsItems.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <item.icon size={20} className="text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors mt-4 text-destructive"
      >
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <LogOut size={20} />
        </div>
        <span className="text-sm font-semibold">Log Out</span>
      </button>

      {/* Partner Code Dialog */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect with Partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Enter the invite code your partner shared with you.
            </p>
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-center text-lg font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || inviteInput.length < 4}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
