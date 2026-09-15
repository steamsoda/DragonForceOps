"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useReadOnly } from "./read-only-controls";
import { directorReadOnlyRequestAllowed } from "@/lib/auth/director-readonly-policy";

// Keep unreviewed entry points visible without routing readers into denied pages.
export function ReadOnlyActionLink(props: ComponentProps<typeof Link>) {
  const readOnly = useReadOnly();
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] : props.href.pathname ?? "";
  if (readOnly && !directorReadOnlyRequestAllowed("GET", path, true)) return <span role="link" aria-disabled="true" title="Solo lectura"
    className={`${props.className ?? ""} cursor-not-allowed opacity-50`}>{props.children}</span>;
  return <Link {...props} />;
}
