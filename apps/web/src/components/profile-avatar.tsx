import Image from "next/image";
import { avatarPath, initials, type AvatarId } from "../profile-avatars";
import styles from "./personal-workspace.module.css";

export function ProfileAvatar({
  name,
  avatar,
  small = false,
}: {
  name: string;
  avatar: AvatarId;
  small?: boolean;
}) {
  const path = avatarPath(avatar);
  return (
    <span className={styles.avatar} data-small={small} aria-hidden="true">
      {path && <Image src={path} alt="" width={80} height={80} unoptimized />}
      {!path && initials(name)}
    </span>
  );
}
