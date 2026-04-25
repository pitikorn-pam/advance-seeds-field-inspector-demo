// Role-based UI access policy. Mirrors the RLS contract in
// supabase/migrations/20260425000002_rls_policies.sql so the UI hides actions
// the database would deny anyway. RLS remains the security boundary; this
// layer just keeps users from seeing buttons that would fail.

import type { Inspection, Profile, Role } from "@advance-seeds/types";

export interface AccessPolicy {
  canCreateVariety(): boolean;
  canEditVariety(): boolean;
  canDeleteVariety(): boolean;

  canCreateBatch(): boolean;
  canEditBatch(): boolean;
  canDeleteBatch(): boolean;

  canViewAllInspections(): boolean;
  canFilterByInspector(): boolean;

  canEditInspection(i: Inspection): boolean;
  canDeleteInspection(i: Inspection): boolean;
}

class Policy implements AccessPolicy {
  constructor(
    private readonly profileId: string,
    private readonly role: Role,
  ) {}

  private isAdmin() {
    return this.role === "admin";
  }

  // Reference data — admin-only writes (matches RLS)
  canCreateVariety() {
    return this.isAdmin();
  }
  canEditVariety() {
    return this.isAdmin();
  }
  canDeleteVariety() {
    return this.isAdmin();
  }
  canCreateBatch() {
    return this.isAdmin();
  }
  canEditBatch() {
    return this.isAdmin();
  }
  canDeleteBatch() {
    return this.isAdmin();
  }

  // Inspections list scope
  canViewAllInspections() {
    return this.isAdmin();
  }
  canFilterByInspector() {
    return this.isAdmin();
  }

  // Inspection row-level — admin can edit any row's notes; only owner can delete
  canEditInspection(i: Inspection) {
    return this.isAdmin() || i.inspector_id === this.profileId;
  }
  canDeleteInspection(i: Inspection) {
    // Admins deliberately cannot delete others' inspections (RLS enforces).
    return i.inspector_id === this.profileId;
  }
}

export function policyFor(profile: Profile | null): AccessPolicy {
  if (!profile) return denyAll;
  return new Policy(profile.id, profile.role);
}

const denyAll: AccessPolicy = {
  canCreateVariety: () => false,
  canEditVariety: () => false,
  canDeleteVariety: () => false,
  canCreateBatch: () => false,
  canEditBatch: () => false,
  canDeleteBatch: () => false,
  canViewAllInspections: () => false,
  canFilterByInspector: () => false,
  canEditInspection: () => false,
  canDeleteInspection: () => false,
};
