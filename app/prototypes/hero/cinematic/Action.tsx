import type { ReactNode } from "react";
import { Arrow } from "../../../components/halenn/Brand";
import s from "./controls.module.css";

export function ActionArrow() {
  return <span className={s.arrowDisc}><Arrow /></span>;
}

export function ActionLink({ href, children, quiet = false, plainArrow = false }: {
  href: string;
  children: ReactNode;
  quiet?: boolean;
  plainArrow?: boolean;
}) {
  return <a href={href} className={`${s.action} ${quiet ? s.quiet : ""} ${plainArrow ? s.plainArrow : ""}`}>
    <span>{children}</span><ActionArrow />
  </a>;
}
