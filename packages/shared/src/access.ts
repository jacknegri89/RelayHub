export type Role = "owner" | "admin" | "viewer";
export type Permission = "read" | "configure" | "manage_members";

const allowed: Record<Permission, Role[]> = {
  read: ["owner", "admin", "viewer"],
  configure: ["owner", "admin"],
  manage_members: ["owner"],
};

export function can(role: Role, permission: Permission) {
  return allowed[permission].includes(role);
}
