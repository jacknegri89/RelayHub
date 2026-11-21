export const avatarIds = ["initials", "signal", "orbit", "routes"] as const;
export type AvatarId = (typeof avatarIds)[number];

export function avatarPath(id: AvatarId) {
  if (id === "initials") {
    return null;
  }
  return "/avatars/" + id + ".png";
}

export function profileAvatar(image?: string | null): AvatarId {
  return avatarIds.find((id) => avatarPath(id) === image) ?? "initials";
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/u);
  const first = Array.from(words[0] ?? "")[0] ?? "";
  let last = "";
  if (words.length > 1) {
    last = Array.from(words[words.length - 1])[0] ?? "";
  }
  return (first + last).toLocaleUpperCase() || "·";
}
