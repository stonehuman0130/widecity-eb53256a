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
  cover_image_url?: string | null;
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

  const getGroupsCacheKey = (userId: string) => `groups_cache_${userId}`;

  const loadCachedGroups = (userId: string): Group[] => {
    try {
      const raw = localStorage.getItem(getGroupsCacheKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Group[]) : [];
    } catch {
      return [];
    }
  };

  const saveCachedGroups = (userId: string, nextGroups: Group[]) => {
    try {
      localStorage.setItem(getGroupsCacheKey(userId), JSON.stringify(nextGroups));
    } catch {
      // no-op
    }
  };

  const clearAllGroupCaches = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("groups_cache_")) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // no-op
    }
  };

  const restoreGroupsFromCache = (userId: string) => {
    const cachedGroups = loadCachedGroups(userId);
    if (cachedGroups.length === 0) return false;

    setGroups(cachedGroups);
    setActiveGroup((prev) => {
      if (prev) {
        return cachedGroups.find((g) => g.id === prev.id) ?? cachedGroups[0] ?? null;
      }
      return cachedGroups[0] ?? null;
    });
    return true;
  };

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const isRetriableError = (message?: string) => {
    if (!message) return false;
    return /timeout|failed to fetch|network|connection/i.test(message);
  };

  const fetchProfile = async (userId: string) => {
    let profileData: Profile | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!error && data) {
        profileData = data as Profile;
        break;
      }

      if (attempt === 2 || !isRetriableError(error?.message)) {
        console.error("Error fetching profile:", error);
        setProfile(null);
        setPartner(null);
        return;
      }

      await wait(350 * (attempt + 1));
    }

    if (!profileData) return;

    setProfile(profileData);

    if (profileData.partner_id) {
      const { data: partnerData } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .eq("id", profileData.partner_id)
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

    if (!session?.access_token) {
      const { data: { session: restoredSession } } = await supabase.auth.getSession();
      if (restoredSession?.access_token) {
        setSession(restoredSession);
      } else {
        const { data: refreshedData } = await supabase.auth.refreshSession();
        if (refreshedData?.session?.access_token) {
          setSession(refreshedData.session);
        } else {
          restoreGroupsFromCache(user.id);
          return;
        }
      }
    }

    let memberships: { group_id: string }[] | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (!error) {
        memberships = (data ?? []) as { group_id: string }[];
        break;
      }

      if (attempt === 3 || !isRetriableError(error.message)) {
        console.error("Error fetching group memberships:", error);
        const { data: directGroups, error: directGroupsError } = await supabase
          .from("groups")
          .select("*");

        if (!directGroupsError && directGroups && directGroups.length > 0) {
          const fallbackEnriched: Group[] = directGroups.map((g: any) => ({
            id: g.id,
            name: g.name,
            type: g.type,
            emoji: g.emoji,
            invite_code: g.invite_code,
            created_by: g.created_by,
            members: [],
          }));
          setGroups(fallbackEnriched);
          setActiveGroup((prev) => {
            if (!prev) return fallbackEnriched[0] ?? null;
            return fallbackEnriched.find((g) => g.id === prev.id) ?? fallbackEnriched[0] ?? null;
          });
          saveCachedGroups(user.id, fallbackEnriched);
          return;
        }

        restoreGroupsFromCache(user.id);
        return;
      }

      await wait(400 * (attempt + 1));
    }

    if (!memberships || memberships.length === 0) {
      const { data: fallbackGroups, error: fallbackGroupsError } = await supabase
        .from("groups")
        .select("*");

      if (!fallbackGroupsError && fallbackGroups && fallbackGroups.length > 0) {
        const fallbackEnriched: Group[] = fallbackGroups.map((g: any) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          emoji: g.emoji,
          invite_code: g.invite_code,
          created_by: g.created_by,
          members: [],
        }));

        setGroups(fallbackEnriched);
        setActiveGroup((prev) => {
          if (!prev) return fallbackEnriched[0] ?? null;
          return fallbackEnriched.find((g) => g.id === prev.id) ?? fallbackEnriched[0] ?? null;
        });
        saveCachedGroups(user.id, fallbackEnriched);
        return;
      }

      if (restoreGroupsFromCache(user.id)) {
        return;
      }

      // Never overwrite visible state with an empty result from a potentially transient auth/backend issue.
      // If this user truly has no groups, create/join flow will still work and populate state.
      return;
    }

    const groupIds = memberships.map((m) => m.group_id);

    const { data: groupsData, error: groupsError } = await supabase
      .from("groups")
      .select("*")
      .in("id", groupIds);

    if (groupsError || !groupsData) {
      console.error("Error fetching groups:", groupsError);
      restoreGroupsFromCache(user.id);
      return;
    }

    const { data: allMembers, error: membersError } = await supabase
      .from("group_members")
      .select("*")
      .in("group_id", groupIds);

    if (membersError) {
      console.error("Error fetching group members:", membersError);
      const fallbackEnriched: Group[] = groupsData.map((g: any) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        emoji: g.emoji,
        invite_code: g.invite_code,
        created_by: g.created_by,
        members: [],
      }));
      setGroups(fallbackEnriched);
      setActiveGroup((prev) => {
        if (!prev) return fallbackEnriched[0] ?? null;
        return fallbackEnriched.find((g) => g.id === prev.id) ?? fallbackEnriched[0] ?? null;
      });
      saveCachedGroups(user.id, fallbackEnriched);
      return;
    }

    const memberUserIds = [...new Set((allMembers || []).map((m: any) => m.user_id))];
    const { data: memberProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .in("id", memberUserIds);

    if (profilesError) {
      console.error("Error fetching member profiles:", profilesError);
      restoreGroupsFromCache(user.id);
      return;
    }

    const profileMap = new Map((memberProfiles || []).map((p: any) => [p.id, p]));

    const enrichedGroups: Group[] = groupsData.map((g: any) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      emoji: g.emoji,
      invite_code: g.invite_code,
      created_by: g.created_by,
      cover_image_url: g.cover_image_url || null,
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
    saveCachedGroups(user.id, enrichedGroups);

    setActiveGroup((prev) => {
      if (prev) {
        const still = enrichedGroups.find((g) => g.id === prev.id);
        return still ?? enrichedGroups[0] ?? null;
      }
      return enrichedGroups.length > 0 ? enrichedGroups[0] : null;
    });
  }, [user, session?.access_token]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshGroups = async () => {
    await fetchGroups();
  };

  useEffect(() => {
    if (!user) return;
    const cachedGroups = loadCachedGroups(user.id);
    if (cachedGroups.length === 0) return;

    setGroups((prev) => (prev.length > 0 ? prev : cachedGroups));
    setActiveGroup((prev) => prev ?? cachedGroups[0] ?? null);
  }, [user]);

  useEffect(() => {
    const loadingFallback = window.setTimeout(() => {
      setLoading((current) => (current ? false : current));
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          restoreGroupsFromCache(session.user.id);
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setProfile(null);
          setPartner(null);
          setGroups([]);
          setActiveGroup(null);
        } else {
          // Transient auth refresh issue: keep local state instead of wiping calendars.
          console.warn("Auth session temporarily unavailable, preserving local state", event);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        restoreGroupsFromCache(session.user.id);
        fetchProfile(session.user.id);
      }
      setLoading(false);
    }).catch((error) => {
      console.error("Error restoring session:", error);
      setLoading(false);
    });

    return () => {
      window.clearTimeout(loadingFallback);
      subscription.unsubscribe();
    };
  }, []);

  // Load groups when user is available
  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user, fetchGroups]);

  useEffect(() => {
    if (!user || groups.length > 0) return;

    const retryOnce = () => {
      void fetchGroups();
    };

    const timeoutId = window.setTimeout(retryOnce, 5000);
    const intervalId = window.setInterval(retryOnce, 15000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [user, groups.length, fetchGroups]);

  const signOut = async () => {
    const currentUserId = user?.id;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setPartner(null);
    setGroups([]);
    setActiveGroup(null);
    if (currentUserId) {
      try {
        localStorage.removeItem(getGroupsCacheKey(currentUserId));
      } catch {
        // no-op
      }
    } else {
      clearAllGroupCaches();
    }
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
