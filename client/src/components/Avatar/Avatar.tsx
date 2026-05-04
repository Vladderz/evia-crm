interface AvatarProps {
  name: string | null | undefined;
  size?: number;
  title?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  const initials = (first + last).toUpperCase();
  return initials || '?';
}

export function Avatar({ name, size = 28, title }: AvatarProps) {
  return (
    <span
      className="avatar-v1"
      title={title ?? name ?? undefined}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      aria-label={name ?? undefined}
    >
      {getInitials(name)}
    </span>
  );
}
