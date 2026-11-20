import Image from "next/image";
import mark from "./brand-mark.png";

export function Brand() {
  return (
    <span className="brand">
      <Image
        src={mark}
        className="brand-mark"
        width={32}
        height={32}
        alt=""
        unoptimized
      />
      RelayHub
    </span>
  );
}
