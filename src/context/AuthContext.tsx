import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
  timezone: string;
  partner_id: string | null;
  invite_code: string | null;
  calendar_token: string | null;
}

interface PartnerProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: string;
  emoji: string;
  invite_code: string;
  created_by: string;
  members: GroupMember[];
}

export interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  partner: PartnerProfile | null;
  groups: Group[];
  activeGroup: Group | null;
  setActiveGroup: (group: Group | null) => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  connectPartner: (code: string) => Promise<{ success?: boolean; error?: string; partner_name?: string }>;
  disconnectPartner: () => Promise<{ success?: boolean; error?: string }>;
  createGroup: (name: string, type: string, emoji: string) => Promise<{ id?: string; invite_code?: string; error?: string }>;
  joinGroup: (code: string) => Promise<{ success?: boolean; group_name?: string; error?: string }>;
  leaveGroup: (groupId: string) => Promise<{ success?: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }

    setProfile(data as Profile);

    if (data?.partner_id) {
      const { data: partnerData } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .eq("id", data.partner_id)
        .single();

      if (partnerData) {
        setPartner(partnerData as PartnerProfile);
      }
    } else {
      setPartner(null);
    }
  };

  const fetchGroups = useCallback(async () => {
    if (!user) return;

    // Get group IDs the user belongs to
    const { data: memberships, error: memErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    console.log("[fetchGroups] memberships:", memberships, "error:", memErr);

    if (!memberships || memberships.length === 0) {
      setGroups([]);
      return;
    }

    const groupIds = memberships.map((m: any) => m.group_id);

    // Fetch groups
    const { data: groupsData } = await supabase
      .from("groups")
      .select("*")
      .in("id", groupIds);

    if (!groupsData) {
      setGroups([]);
      return;
    }

    // Fetch all members for these groups
    const { data: allMembers } = await supabase
      .from("group_members")
      .select("*")
      .in("group_id", groupIds);

    // Fetch profiles for all members
    const memberUserIds = [...new Set((allMembers || []).map((m: any) => m.user_id))];
    const { data: memberProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .in("id", memberUserIds);

    const profileMap = new Map((memberProfiles || []).map((p: any) => [p.id, p]));

    const enrichedGroups: Group[] = groupsData.map((g: any) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      emoji: g.emoji,
      invite_code: g.invite_code,
      created_by: g.created_by,
      members: (allMembers || [])
        .filter((m: any) => m.group_id === g.id)
        .map((m: any) => {
          const p = profileMap.get(m.user_id);
          return {
            id: m.id,
            user_id: m.user_id,
            role: m.role,
            display_name: p?.display_name || null,
            email: p?.email || null,
            avatar_url: p?.avatar_url || null,
          };
        }),
    }));

    setGroups(enrichedGroups);

    // Restore active group or set first one
    if (activeGroup) {
      const still = enrichedGroups.find((g) => g.id === activeGroup.id);
      if (still) {
        setActiveGroup(still);
      } else if (enrichedGroups.length > 0) {
        setActiveGroup(enrichedGroups[0]);
      } else {
        setActiveGroup(null);
      }
    } else if (enrichedGroups.length > 0) {
      setActiveGroup(enrichedGroups[0]);
    }
  }, [user]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshGroups = async () => {
    await fetchGroups();
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setPartner(null);
          setGroups([]);
          setActiveGroup(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load groups when user is available
  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user, fetchGroups]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setPartner(null);
    setGroups([]);
    setActiveGroup(null);
  };

  const connectPartner = async (code: string) => {
    const { data, error } = await supabase.rpc("connect_partner", { code });
    if (error) return { error: error.message };
    const result = data as any;
    if (result?.error) return { error: result.error };
    await refreshProfile();
    return { success: true, partner_name: result.partner_name };
  };

  const disconnectPartner = async () => {
    const { data, error } = await supabase.rpc("disconnect_partner");
    if (error) return { error: error.message };
    const result = data as any;
    if (result?.error) return { error: result.error };
    setPartner(null);
    await refreshProfile();
    return { success: true };
  };

  const createGroup = async (name: string, type: string, emoji: string) => {
    const { data, error } = await supabase.rpc("create_group", {
      _name: name,
      _type: type,
      _emoji: emoji,
    });
    if (error) return { error: error.message };
    const result = data as any;
    if (result?.error) return { error: result.error };
    await fetchGroups();
    return { id: result.id, invite_code: result.invite_code };
  };

  const joinGroup = async (code: string) => {
    const { data, error } = await supabase.rpc("join_group", { _code: code });
    if (error) return { error: error.message };
    const result = data as any;
    if (result?.error) return { error: result.error };
    await fetchGroups();
    return { success: true, group_name: result.group_name };
  };

  const leaveGroup = async (groupId: string) => {
    const { data, error } = await supabase.rpc("leave_group", { _group_id: groupId });
    if (error) return { error: error.message };
    const result = data as any;
    if (result?.error) return { error: result.error };
    await fetchGroups();
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, partner,
        groups, activeGroup, setActiveGroup,
        loading, signOut, refreshProfile, refreshGroups,
        connectPartner, disconnectPartner,
        createGroup, joinGroup, leaveGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
