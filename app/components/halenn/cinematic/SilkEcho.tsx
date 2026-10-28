import Silk from "./Silk";
import s from "./silk-echo.module.css";

// The same fabric returns with each section, moving with its content.
// Each surface runs only while visible and honors reduced motion.
export default function SilkEcho({ scene }: { scene: "projects" | "contact" }) {
  return <div className={`${s.echo} ${s[scene]}`} data-silk-echo={scene} data-silk-scene aria-hidden="true">
    <div className={s.fold}>
      <Silk sizes="(max-width:600px) 240vw, 140vw" />
    </div>
  </div>;
}
