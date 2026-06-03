import Image from "next/image";
const LOGO_SRC = "/medica-logo.png";

type MedicaLogoProps = {
  className?: string;
  imgClassName?: string;
  priority?: boolean;
};

export function MedicaLogo({
  className = "",
  imgClassName = "",
  priority = false,
}: MedicaLogoProps) {
  return (
    <span className={`inline-flex bg-transparent ${className}`.trim()}>
      {/* unoptimized preserves PNG transparency (optimization can occasionally flatten alpha). */}
      <Image
        src={LOGO_SRC}
        alt="Medica Enterprises"
        width={220}
        height={64}
        priority={priority}
        unoptimized
        className={`h-auto w-auto max-h-10 max-w-[11rem] bg-transparent object-contain object-left [background:none] ${imgClassName}`.trim()}
        sizes="(max-width: 1024px) 200px, 180px"
      />
    </span>
  );
}
