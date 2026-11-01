"use client";

import { useEffect } from "react";
import { manageTabTitle } from "../lib/tab-title";

export default function useSmartTabTitle(title?: string, awayTitle?: string) {
  useEffect(() => {
    if (!title && !awayTitle) return;
    return manageTabTitle(title, awayTitle);
  }, [title, awayTitle]);
}
