import { useCallback, useRef } from 'react';

import { CalendarIcon } from './UiIcons';
import { ownerDateInputToday, type OwnerRange } from '../lib/ownerPortalData';

export const LAUNDRY_PERIOD_RANGES: { id: Exclude<OwnerRange, 'date'>; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
];

type Props = {
  range: OwnerRange;
  dateInput: string;
  onRange: (range: OwnerRange) => void;
  onDateInput: (value: string) => void;
  dateInputId?: string;
  className?: string;
};

export function LaundryPeriodPicker({ range, dateInput, onRange, onDateInput, dateInputId = 'laundry-period-date', className }: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* fallback */
      }
    }
    input.focus();
    input.click();
  }, []);

  return (
  <>
    <div className={`ly-range ly-range--wrap ly-range--sales${className ? ` ${className}` : ''}`} role="tablist" aria-label="Period">
      {LAUNDRY_PERIOD_RANGES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={range === option.id}
          className={range === option.id ? 'is-on' : ''}
          onClick={() => onRange(option.id)}
        >
          {option.label}
        </button>
      ))}
      <label
        className={`ly-range-date-btn${range === 'date' ? ' is-on' : ''}`}
        title={range === 'date' ? `Date: ${dateInput}` : 'Choose a specific date'}
        htmlFor={dateInputId}
        onClick={() => openDatePicker()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDatePicker();
          }
        }}
      >
        <span className="ly-range-date-icon" aria-hidden>
          <CalendarIcon />
        </span>
        <input
          id={dateInputId}
          ref={dateInputRef}
          type="date"
          className="sales-date-input-overlay"
          value={dateInput}
          max={ownerDateInputToday()}
          onChange={(event) => {
            if (!event.target.value) return;
            onDateInput(event.target.value);
            onRange('date');
          }}
          aria-label="Select date"
        />
      </label>
    </div>
    {range === 'date' ? (
      <p className="muted-block ly-sales-date-hint">
        Showing data for <strong>{dateInput}</strong>
      </p>
    ) : null}
  </>
  );
}