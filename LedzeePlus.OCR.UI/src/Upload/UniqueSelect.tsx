import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ChevronDownSvg = ({ rotated }: { rotated?: boolean }) => (
  <svg
    className={`uselect-chevron ${rotated ? 'rotated' : ''}`}
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M3 6l5 5 5-5" />
  </svg>
);

const SearchSvg = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    className="uselect-search-icon"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5l4 4" />
  </svg>
);

const ClearXCircleSvg = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
  </svg>
);

const CheckCircleFillSvg = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="#16a34a" className="uselect-check-icon" aria-hidden="true">
    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
  </svg>
);

const PlusCircleSvg = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="uselect-opt-icon" aria-hidden="true">
    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
  </svg>
);

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  badgeColor?: 'blue' | 'green' | 'amber' | 'slate' | 'purple';
  icon?: string;
}

interface UniqueSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'default' | 'chip' | 'inline';
  searchable?: boolean;
  allowClear?: boolean;
  minMenuWidth?: number;
}

export function UniqueSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  variant = 'default',
  searchable = true,
  allowClear = true,
  minMenuWidth = 210
}: UniqueSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUp: boolean;
  }>({ left: 0, width: 200, openUp: false });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(options.length * 36 + (searchable ? 46 : 16), 250);
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const maxAvailableW = Math.max(200, window.innerWidth - 24);
    const menuW = Math.min(Math.max(rect.width, minMenuWidth), maxAvailableW);

    // Keep within right edge of viewport
    let leftPos = rect.left;
    if (leftPos + menuW > window.innerWidth - 12) {
      leftPos = Math.max(12, rect.right - menuW);
    }
    if (leftPos < 12) {
      leftPos = 12;
    }

    setMenuPosition({
      top: openUp ? undefined : rect.bottom + 5,
      bottom: openUp ? window.innerHeight - rect.top + 5 : undefined,
      left: leftPos,
      width: menuW,
      openUp
    });
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setSearchQuery('');
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      // Allow scrolling inside the menu itself
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opt.badge && opt.badge.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const trimmedQuery = searchQuery.trim();
  const hasExactMatch = options.some(
    (opt) => opt.label.toLowerCase() === trimmedQuery.toLowerCase() || opt.value.toLowerCase() === trimmedQuery.toLowerCase()
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const displayLabel = selectedOption ? selectedOption.label : value;

  const renderTrigger = () => {
    if (variant === 'chip') {
      return (
        <div
          ref={triggerRef}
          onClick={toggleMenu}
          className={`uselect-chip-trigger ${isOpen ? 'open' : ''} ${value ? 'has-val' : ''}`}
          role="button"
          tabIndex={0}
        >
          <span className="uselect-chip-text">
            {displayLabel || placeholder}
          </span>
          <ChevronDownSvg rotated={isOpen} />
        </div>
      );
    }

    if (variant === 'inline') {
      return (
        <div
          ref={triggerRef}
          onClick={toggleMenu}
          className={`uselect-inline-trigger ${isOpen ? 'open' : ''}`}
          role="button"
          tabIndex={0}
        >
          {selectedOption?.icon && (
            <i className={`bi ${selectedOption.icon} uselect-inline-icon`}></i>
          )}
          <span className="uselect-inline-text">
            {displayLabel || placeholder}
          </span>
          <ChevronDownSvg rotated={isOpen} />
        </div>
      );
    }

    // Default variant (sleek rounded pill field)
    return (
      <div
        ref={triggerRef}
        onClick={toggleMenu}
        className={`uselect-default-trigger ${isOpen ? 'open' : ''} ${value ? 'has-value' : ''}`}
        role="button"
        tabIndex={0}
      >
        <div className="uselect-trigger-left">
          <span className={`uselect-selected-dot ${value ? 'is-selected' : ''}`}></span>
          {value ? (
            <span className="uselect-value-text" title={displayLabel}>
              {displayLabel}
            </span>
          ) : (
            <span className="uselect-placeholder">{placeholder}</span>
          )}
        </div>

        <div className="uselect-trigger-right">
          {value && allowClear && (
            <span
              className="uselect-clear-btn"
              onClick={handleClear}
              title="Clear selection"
            >
              <ClearXCircleSvg />
            </span>
          )}
          <ChevronDownSvg rotated={isOpen} />
        </div>
      </div>
    );
  };

  return (
    <>
      {renderTrigger()}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className={`uselect-portal-menu ${menuPosition.openUp ? 'open-up' : 'open-down'}`}
            style={{
              position: 'fixed',
              top: menuPosition.top !== undefined ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom !== undefined ? `${menuPosition.bottom}px` : undefined,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
              zIndex: 9999
            }}
          >
            {searchable && (
              <div className="uselect-search-box">
                <SearchSvg />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="uselect-search-input"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="uselect-search-clear"
                    onClick={() => setSearchQuery('')}
                  >
                    <ClearXCircleSvg />
                  </button>
                )}
              </div>
            )}

            <div className="uselect-options-list">
              {filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    className={`uselect-option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <div className="uselect-option-main">
                      {opt.icon && (
                        <i className={`bi ${opt.icon} uselect-opt-icon`}></i>
                      )}
                      <span className="uselect-opt-label">{opt.label}</span>
                    </div>
                    <div className="uselect-option-meta">
                      {opt.badge && (
                        <span className={`uselect-opt-badge ${opt.badgeColor || 'slate'}`}>
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <CheckCircleFillSvg />}
                    </div>
                  </div>
                );
              })}

              {trimmedQuery && !hasExactMatch && (
                <div
                  className="uselect-option-item uselect-custom-option"
                  onClick={() => handleSelect(trimmedQuery)}
                >
                  <div className="uselect-option-main">
                    <PlusCircleSvg />
                    <span className="uselect-opt-label">Use &ldquo;{trimmedQuery}&rdquo;</span>
                  </div>
                  <span className="uselect-opt-badge blue">Custom</span>
                </div>
              )}

              {filteredOptions.length === 0 && !trimmedQuery && (
                <div className="uselect-empty-state">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '6px' }}>
                    <path d="M4.98 4a.5.5 0 0 0-.39.188L1.54 8H6a.5.5 0 0 1 .5.5 1.5 1.5 0 1 0 3 0A.5.5 0 0 1 10 8h4.46l-3.05-3.812A.5.5 0 0 0 11.02 4H4.98zm-1.17-.404A1.5 1.5 0 0 1 4.98 3h6.04a1.5 1.5 0 0 1 1.17.596l3.63 4.537A1.5 1.5 0 0 1 16 9.07v4.43A1.5 1.5 0 0 1 14.5 15h-13A1.5 1.5 0 0 1 0 13.5V9.07a1.5 1.5 0 0 1 .18-.707l3.63-4.537z"/>
                  </svg>
                  No matching options
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default UniqueSelect;

