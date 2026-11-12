import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface NeatDatePickerProps {
  value: string; // Expected format: DD/MM/YYYY
  onChange: (value: string) => void;
  theme?: 'ocr' | 'tally';
  ariaLabel?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDDMMYYYY(str: string): Date | null {
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900 || year > 2100) return null;
  const d = new Date(year, month, day);
  if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
    return d;
  }
  return null;
}

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function NeatDatePicker({
  value,
  onChange,
  theme = 'ocr',
  ariaLabel = 'Date'
}: NeatDatePickerProps) {
  const parsedInitial = parseDDMMYYYY(value) || new Date(2026, 8, 24);
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsedInitial.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedInitial.getMonth());
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const selectedDate = parseDDMMYYYY(value);
  const today = new Date();
  const themeClass = theme === 'tally' ? 'ndp-tally' : '';

  const updatePopoverPos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popWidth = 264;
    const popHeight = 290;
    let left = rect.left;
    if (left + popWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.right - popWidth);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < popHeight && rect.top > popHeight + 12
        ? Math.max(12, rect.top - popHeight - 6)
        : rect.bottom + 6;
    setPopoverPos({ top, left });
  };

  const openPicker = () => {
    const current = parseDDMMYYYY(value);
    if (current) {
      setViewYear(current.getFullYear());
      setViewMonth(current.getMonth());
    }
    updatePopoverPos();
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        popoverRef.current &&
        !popoverRef.current.contains(t)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    const parsed = parseDDMMYYYY(val);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build 42 calendar cells
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { day: number; monthOffset: -1 | 0 | 1 }[] = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, monthOffset: -1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, monthOffset: 0 });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, monthOffset: 1 });
  }

  const handleSelectCell = (day: number, monthOffset: -1 | 0 | 1) => {
    const targetDate = new Date(viewYear, viewMonth + monthOffset, day);
    onChange(formatDDMMYYYY(targetDate));
    setViewYear(targetDate.getFullYear());
    setViewMonth(targetDate.getMonth());
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    onChange(formatDDMMYYYY(now));
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        className={`ndp-trigger ${themeClass} ${isOpen ? 'open' : ''}`.trim()}
      >
        <input
          type="text"
          className="ndp-input"
          value={value}
          onChange={handleInputChange}
          placeholder="DD/MM/YYYY"
          maxLength={10}
          aria-label={ariaLabel}
        />
        <button
          type="button"
          className="ndp-cal-btn"
          onClick={openPicker}
          title="Pick date"
          aria-label="Pick date"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
            aria-hidden="true"
          >
            <path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z" />
            <path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
          </svg>
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={`ndp-popover ${themeClass}`.trim()}
            style={{
              position: 'fixed',
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              zIndex: 9999
            }}
          >
            <div className="ndp-cal-header">
              <button type="button" className="ndp-nav-btn" onClick={prevMonth} title="Previous month">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                </svg>
              </button>
              <div className="ndp-month-year">
                <span className="ndp-month-label">{MONTHS[viewMonth]}</span>
                <span className="ndp-year-label">{viewYear}</span>
              </div>
              <button type="button" className="ndp-nav-btn" onClick={nextMonth} title="Next month">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>

            <div className="ndp-weekdays">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="ndp-weekday">
                  {wd}
                </div>
              ))}
            </div>

            <div className="ndp-days-grid">
              {cells.map((cell, idx) => {
                const cellDate = new Date(viewYear, viewMonth + cell.monthOffset, cell.day);
                const isSelected =
                  selectedDate !== null &&
                  cellDate.getFullYear() === selectedDate.getFullYear() &&
                  cellDate.getMonth() === selectedDate.getMonth() &&
                  cellDate.getDate() === selectedDate.getDate();

                const isToday =
                  cellDate.getFullYear() === today.getFullYear() &&
                  cellDate.getMonth() === today.getMonth() &&
                  cellDate.getDate() === today.getDate();

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectCell(cell.day, cell.monthOffset)}
                    className={`ndp-day-cell ${cell.monthOffset !== 0 ? 'outside' : ''} ${
                      isSelected ? 'selected' : ''
                    } ${isToday ? 'today' : ''}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="ndp-cal-footer">
              <button type="button" className="ndp-today-btn" onClick={handleSelectToday}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
                  <path d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
                  <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/>
                </svg>
                Today
              </button>
              <span className="ndp-selected-preview">
                {selectedDate
                  ? `${String(selectedDate.getDate()).padStart(2, '0')} ${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getFullYear()}`
                  : 'DD/MM/YYYY'}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default NeatDatePicker;

