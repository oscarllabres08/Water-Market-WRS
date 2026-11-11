type IconProps = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': true as const,
};

export function DropIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path
        d="M12 3.2c-3.1 4.4-5.4 7.6-5.4 10.4a5.4 5.4 0 0 0 10.8 0c0-2.8-2.3-6-5.4-10.4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IceIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3.5 16.5 6v5L12 13.5 7.5 11V6L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 13.5V20M7.5 11 4 16.5M16.5 11 20 16.5M12 8.2v5.3M9.2 9.6h5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BoxIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3.5 4.5 7.2v9.6L12 20.5l7.5-3.7V7.2L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4.5 7.2 12 11l7.5-3.8M12 11v9.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base} width={22} height={22}>
      <path d="M4 8.5h2.2l1.3-2h7l1.3 2H20v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V8.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 4.5 3.5 19h17L12 4.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckBoxIcon({ checked, className }: IconProps & { checked: boolean }) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      {checked ? <path d="M8 12.2 10.8 15 16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function PesoIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M8 4v16M8 4h6.2a3.2 3.2 0 0 1 0 6.4H8M6.5 8.2H16M6.5 11.2H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 16.5 9 11l3 2.5L20 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReceiptIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 3.5h10v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 8h5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="m12 4 1.8 4.2 4.6.5-3.4 3.1.9 4.5L12 14.2 7.1 16.3l.9-4.5L4.6 8.7l4.6-.5L12 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="9" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.2 17.5c.5-2.4 2.3-3.6 4.8-3.6s4.3 1.2 4.8 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.2" cy="9" r="1.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 17.5c.3-1.6 1.2-2.6 2.8-2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
