"use client";

import { useEffect } from "react";

export function GuideBookmarks() {
  useEffect(() => {
    // Keep links shared before these sections moved to the guide working.
    function followGuideBookmark() {
      const hash = window.location.hash;
      if (hash === "#journey" || hash === "#ledger-title") {
        window.location.replace("/guide" + hash);
      }
    }

    followGuideBookmark();
    window.addEventListener("hashchange", followGuideBookmark);
    return () => window.removeEventListener("hashchange", followGuideBookmark);
  }, []);

  return null;
}
