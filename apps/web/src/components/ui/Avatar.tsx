export function Avatar({ initials, color = '#374151', size = 32 }: { initials: string; color?: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.36,
      fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}
