import React from 'react';

interface TallyLogoBadgeProps {
  className?: string;
  variant?: 'default' | 'compact' | 'mini';
}

export const TallyLogoBadge: React.FC<TallyLogoBadgeProps> = ({ className = '', variant = 'default' }) => {
  const isCompact = variant === 'compact' || variant === 'mini';

  return (
    <div
      className={`tally-inner-pill ${className}`.trim()}
      style={{
        background: '#ffffff',
        borderRadius: isCompact ? '6px' : '7px',
        padding: isCompact ? '2px 7px 2px 7px' : '2px 9px 2px 9px',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
        height: isCompact ? '21px' : '25px',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: "Georgia, 'Times New Roman', Garamond, serif",
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: isCompact ? '11.5px' : '14px',
          color: '#414d59',
          letterSpacing: '-0.2px',
          lineHeight: 1,
        }}
      >
        Tally
      </span>
      <svg
        width={isCompact ? '24' : '30'}
        height="3"
        viewBox="0 0 30 3"
        fill="none"
        style={{ marginTop: '1.5px', display: 'block' }}
        aria-hidden="true"
      >
        <path d="M1 1.2C7 2.6 22 2.8 29 1.1" stroke="#ea3a3a" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export default TallyLogoBadge;

