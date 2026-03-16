import Image from "next/image";

export function DocImage({
  src,
  alt,
  bordered = true,
}: {
  src: string;
  alt: string;
  bordered?: boolean;
}) {
  return (
    <figure className="my-6">
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        className={`w-full h-auto rounded-lg${bordered ? " border border-mk-border" : ""}`}
        quality={90}
      />
      <figcaption className="mt-2 text-center text-xs text-mk-text-muted">
        {alt}
      </figcaption>
    </figure>
  );
}
