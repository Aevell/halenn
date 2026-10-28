/** The crossbar-free A and letterspacing follow the supplied Halenn reference. */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <svg className={className} width="167" height="24" viewBox="0 0 167 24" fill="none" role="img" aria-label="Halenn">
      <path d="M1 3v18M16 3v18M1 12h15M31 21 39 3l8 18M62 3v18h14M105 3H91v18h14M91 12h12M120 21V3l15 18V3M150 21V3l15 18V3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
