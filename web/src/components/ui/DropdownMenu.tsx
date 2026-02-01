import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

export default function DropdownMenu({ trigger, children, align = 'right' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 144; // w-36 = 9rem = 144px

      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: align === 'right'
          ? rect.right + window.scrollX - menuWidth
          : rect.left + window.scrollX,
      });
    }
  }, [isOpen, align]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    // Use capture phase to handle clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => setIsOpen(false);
    window.addEventListener('scroll', handleScroll, true);

    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {trigger}
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] min-w-[144px] animate-fade-in"
          style={{
            top: position.top,
            left: position.left,
          }}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
}

// Helper component for menu items
interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function DropdownItem({ children, onClick, href, variant = 'default', disabled }: DropdownItemProps) {
  const baseClasses = 'block w-full text-left px-4 py-2 text-sm transition-colors';
  const variantClasses = variant === 'danger'
    ? 'text-red-600 hover:bg-red-50'
    : 'text-gray-700 hover:bg-gray-50';
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';

  if (href && !disabled) {
    // Using regular anchor since we're in a portal and React Router Link might not work properly
    return (
      <a
        href={href}
        className={`${baseClasses} ${variantClasses}`}
        onClick={() => {
          if (onClick) onClick();
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabledClasses}`}
    >
      {children}
    </button>
  );
}
