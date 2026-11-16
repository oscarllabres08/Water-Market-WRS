import { useEffect, useRef, useState } from 'react';

type Props = {
  onEdit: () => void;
  onRemove: () => void;
};

export function LaundryCustomerRowMenu({ onEdit, onRemove }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 96;
    const openUp = rect.bottom + menuHeight + 8 > window.innerHeight;
    setPos({
      top: openUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="row-menu">
      <button
        ref={buttonRef}
        type="button"
        className="row-menu-trigger"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ···
      </button>
      {open && pos ? (
        <div ref={panelRef} className="row-menu-panel" role="menu" style={{ top: pos.top, right: pos.right }}>
          <button type="button" role="menuitem" onClick={() => choose(onEdit)}>
            Edit details
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => choose(onRemove)}>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}