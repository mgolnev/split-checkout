export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center"
      role="status"
    >
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">{description}</p> : null}
    </div>
  );
}
