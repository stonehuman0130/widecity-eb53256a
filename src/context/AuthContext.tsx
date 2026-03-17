import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
}

interface PartnerProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  partner: PartnerProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  connectPartner: (code: string) => Promise<{ success?: boolean; error?: string; partner_name?: string }>;
  disconnectPartner: () => Promise<{ success?: boolean; error?: string }>;
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

    // Fetch partner if connected
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

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setPartner(null);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setPartner(null);
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

  return (
    <AuthContext.Provider
      value={{ user, session, profile, partner, loading, signOut, refreshProfile, connectPartner, disconnectPartner }}
    >
      {children}
    </AuthContext.Provider>
  );
};
