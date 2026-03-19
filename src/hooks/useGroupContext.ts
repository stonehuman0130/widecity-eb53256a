import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

export interface MemberFilter {
  id: string;
  label: string;
}

/**
 * Returns group-aware filter options and member info based on the active group.
 * When a group is selected, filters show that group's members.
 * When "All" is selected, falls back to partner-based filters.
 */
export function useGroupContext() {
  const { user, partner, activeGroup } = useAuth();

  const otherMembers = useMemo(() => {
    if (!activeGroup || !user) return [];
    return activeGroup.members.filter((m) => m.user_id !== user.id);
  }, [activeGroup, user]);

  // The "other person" label — either the group member or the partner
  const otherName = useMemo(() => {
    if (activeGroup && otherMembers.length === 1) {
      return otherMembers[0].display_name || "Member";
    }
    if (activeGroup && otherMembers.length > 1) {
      return "Others";
    }
    return partner?.display_name || "Partner";
  }, [activeGroup, otherMembers, partner]);

  // In "All" mode (no active group), don't show partner/household filters
  const hasOther = useMemo(() => {
    if (!activeGroup) return false;
    return otherMembers.length > 0;
  }, [activeGroup, otherMembers]);

  // The shared/household label
  const sharedLabel = useMemo(() => {
    if (activeGroup) {
      if (otherMembers.length === 1) return "Together";
      if (otherMembers.length > 1) return "Shared";
      return "Shared";
    }
    return "Household";
  }, [activeGroup, otherMembers]);

  // Build the 3-tab filter set: Mine / OtherName's / Shared
  const filters: MemberFilter[] = useMemo(() => {
    const result: MemberFilter[] = [{ id: "mine", label: "Mine" }];
    if (hasOther) {
      result.push({ id: "partner", label: `${otherName}'s` });
      result.push({ id: "household", label: sharedLabel });
    }
    return result;
  }, [hasOther, otherName, sharedLabel]);

  // Two-tab filter for habits/workouts: Mine / OtherName's
  const twoTabFilters: MemberFilter[] = useMemo(() => {
    const result: MemberFilter[] = [{ id: "mine", label: "Mine" }];
    if (hasOther) {
      result.push({ id: "partner", label: `${otherName}'s` });
    }
    return result;
  }, [hasOther, otherName]);

  // Google Calendar should be shown in both "All" and specific group views
  const showGoogleCalendar = true;

  return {
    otherMembers,
    otherName,
    hasOther,
    sharedLabel,
    filters,
    twoTabFilters,
    showGoogleCalendar,
  };
}
