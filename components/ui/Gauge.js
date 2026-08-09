'use client';

import { useTheme } from '@/lib/ThemeContext';

export default function Gauge({ percent = 0, size = 64, stroke = 6, color = '#F2A93B', track, overColor = '#F2545B' }) {
  const { theme } = useTheme();
  const resolvedTrack = track || (theme === 'dark' ? '#1F2C45' : '#E1E5EB');
  const clamped = Math.max(0, Math.min(percent, 100));
  const over = percent > 100;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;
  const c = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke={resolvedTrack} strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={over ? overColor : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - dash}
          style={{
            '--dash-total': circumference,
            '--dash-offset': circumference - dash,
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.3s',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono text-[11px] font-medium ${over ? 'text-signal-red' : 'text-paper-100'}`}>
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}
