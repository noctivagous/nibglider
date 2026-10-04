// Widget-level move handle: grip affordance shared by the menus rail, the
// panel sections box, and the on-screen keyboard. Foundation for draggable
// widgets: stable data-widget hook and label; pointer dragging lands later.
export default function WidgetHandle({
  widget,
  label,
}: {
  widget: string;
  label: string;
}) {
  return (
    <span
      className="widget-handle"
      role="button"
      tabIndex={0}
      data-widget={widget}
      title={`${label}: drag to move (coming soon)`}
      aria-label={`${label} move handle`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      }}
    >
      <svg viewBox="0 0 8 16" width="8" height="16" aria-hidden="true">
        <circle cx="2.5" cy="3" r="1.1" fill="currentColor" />
        <circle cx="5.5" cy="3" r="1.1" fill="currentColor" />
        <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
        <circle cx="5.5" cy="8" r="1.1" fill="currentColor" />
        <circle cx="2.5" cy="13" r="1.1" fill="currentColor" />
        <circle cx="5.5" cy="13" r="1.1" fill="currentColor" />
      </svg>
    </span>
  );
}
