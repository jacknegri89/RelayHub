import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PublicFooter, PublicHeader } from "../../components/public-navigation";
import { auth } from "../../server/auth";
import landing from "../landing.module.css";

export default async function LostResponseLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth().api.getSession({ headers: await headers() });
  return (
    <div className={landing.landing}>
      <PublicHeader signedIn={Boolean(session)} />
      {children}
      <PublicFooter />
    </div>
  );
}
