import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { accountEmailConfigured } from "@relayhub/shared/mail";

import { accountPages, accountMailPages } from "../../server/account-pages";

export default async function AccountRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ authPage: string }>;
}) {
  const { authPage } = await params;
  const emailPageAvailable =
    accountMailPages.has(authPage) && accountEmailConfigured();
  // Resolve unknown pages before the form's loading boundary streams HTTP 200.
  if (!accountPages.has(authPage) && !emailPageAvailable) {
    notFound();
  }
  return children;
}
