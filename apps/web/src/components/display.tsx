export function Status({ value }: { value: string }) {
  return (
    <span className="status" data-status={value}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function ShortId({ id }: { id: string }) {
  return <code title={id}>{id.slice(0, 8)}</code>;
}

export function Time({ value }: { value: Date }) {
  const iso = value.toISOString();
  return (
    <time dateTime={iso} title={iso}>
      {iso.slice(0, 19).replace("T", " ")} UTC
    </time>
  );
}
