import { Motion } from "./motion";

export function PageHeading({
  title,
  description,
  className = "page-heading",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <Motion kind="heading" className={className}>
      <h1>{title}</h1>
      {description && <p className="intro">{description}</p>}
    </Motion>
  );
}
