import Image from "next/image";

export function Mark({ className = "", priority = false, highResolution = false }: {
  className?: string;
  priority?: boolean;
  highResolution?: boolean;
}) {
  return (
    <Image
      className={className}
      src={highResolution ? "/prototypes/halenn-original-2x.png" : "/prototypes/halenn-original.png"}
      width={highResolution ? 3548 : 1774}
      height={highResolution ? 1774 : 887}
      alt=""
      aria-hidden="true"
      unoptimized
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
    />
  );
}

export function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d={down ? "M10 3v14m-5-5 5 5 5-5" : "M4 10h12m-5-5 5 5-5 5"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
