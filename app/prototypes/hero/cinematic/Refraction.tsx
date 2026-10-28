import type { ReactNode } from "react";
import Image from "next/image";
import Silk from "./Silk";
import { ribbonClearancePath } from "./ribbon-clearance";
import s from "./refraction.module.css";

// One uninterrupted surface behind the hero and the services it introduces.
// The artwork is a separate foreground layer and is never filtered or animated.
export default function Refraction({ children }: { children: ReactNode }) {
  return <div className={s.passage}>
    <svg className={s.maskDefinitions} width="100%" height="100%" aria-hidden="true">
      <defs>
        <filter id="silk-clearance-feather" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <mask id="silk-logo-clearance" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" style={{ maskType: "luminance" }}>
          <rect width="100%" height="100%" fill="white" />
          <g data-silk-exclusion>
            <g filter="url(#silk-clearance-feather)">
              <path data-silk-outline d={ribbonClearancePath} fill="black" stroke="black" strokeWidth="112" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
            <path data-silk-outline d={ribbonClearancePath} fill="black" stroke="black" strokeWidth="80" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>
        </mask>
      </defs>
    </svg>
    <div className={s.field} aria-hidden="true">
      <div className={s.viewport} data-refraction data-silk-scene>
        <div className={s.clearance} data-silk-clearance>
          <div className={s.travel} data-refraction-travel>
            <div className={s.silkPlacement} data-silk-placement>
              <Silk eager />
            </div>
            <div className={s.leftFold}>
              <Image src="/prototypes/halenn-silk-v1.png" alt="" fill
                sizes="(max-width:600px) 180vw, (max-width:1000px) 130vw, 100vw" loading="eager" draggable={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
    {children}
  </div>;
}
