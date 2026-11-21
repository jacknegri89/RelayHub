import Image from "next/image";

// Use the same stepped light cone as the email masthead and the browser tab.
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Image
      className="brand-mark"
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      unoptimized
    />
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">RelayHub</span>
    </span>
  );
}
