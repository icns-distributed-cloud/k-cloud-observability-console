interface KindGlyphProps {
  kind: 'GPU' | 'NPU' | 'PIM'
  size?: number
}

const COLORS = {
  GPU: 'var(--gpu)',
  NPU: 'var(--npu)',
  PIM: 'var(--pim)',
}

export default function KindGlyph({ kind, size = 12 }: KindGlyphProps) {
  const color = COLORS[kind]

  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
      {kind === 'GPU' && <rect x={1} y={1} width={10} height={10} rx={2} fill={color} />}
      {kind === 'NPU' && <polygon points="6,1 11,11 1,11" fill={color} />}
      {kind === 'PIM' && (
        <polygon points="6,0.6 10.7,3.3 10.7,8.7 6,11.4 1.3,8.7 1.3,3.3" fill={color} />
      )}
    </svg>
  )
}