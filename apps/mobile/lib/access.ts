import type { Inspection, Profile, Role } from "@advance-seeds/types";

export interface AccessPolicy {
  canCreateVariety(): boolean;
  canEditVariety(): boolean;
  canDeleteVariety(): boolean;
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
  canCreateVariety() {
    return this.isAdmin();
  }
  canEditVariety() {
    return this.isAdmin();
  }
  canDeleteVariety() {
    return this.isAdmin();
  }
  canViewAllInspections() {
    return this.isAdmin();
  }
  canFilterByInspector() {
    return this.isAdmin();
  }
  canEditInspection(i: Inspection) {
    return this.isAdmin() || i.inspector_id === this.profileId;
  }
  canDeleteInspection(i: Inspection) {
    return i.inspector_id === this.profileId;
  }
}

const denyAll: AccessPolicy = {
  canCreateVariety: () => false,
  canEditVariety: () => false,
  canDeleteVariety: () => false,
  canViewAllInspections: () => false,
  canFilterByInspector: () => false,
  canEditInspection: () => false,
  canDeleteInspection: () => false,
};

export function policyFor(profile: Profile | null): AccessPolicy {
  if (!profile) return denyAll;
  return new Policy(profile.id, profile.role);
}
