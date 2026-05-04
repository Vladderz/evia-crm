import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  /** Called when the drawer wants to close (X click, backdrop click, Escape). */
  onClose: () => void;
  title: string;
  description?: string;
  /** Footer is sticky to the bottom; usually right-aligned action buttons. */
  footer?: ReactNode;
  /**
   * If true, closing via X / backdrop / Escape will trigger a confirm
   * dialog. The Drawer doesn't handle the confirm itself - callers
   * intercept onClose with their own check.
   */
  isDirty?: boolean;
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="drawer-content" aria-describedby={description ? undefined : undefined}>
          <div className="drawer-header">
            <div>
              <Dialog.Title className="drawer-title">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="drawer-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="drawer-close" aria-label="Close drawer">
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <div className="drawer-body">{children}</div>
          {footer && <div className="drawer-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
