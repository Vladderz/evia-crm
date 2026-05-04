import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  /** Right-aligned footer content - usually action buttons. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay-v1" />
        <Dialog.Content className={`modal-content-v1 modal-size-${size}`}>
          <div className="modal-header-v1">
            <div>
              <Dialog.Title className="modal-title-v1">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="modal-description-v1">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="modal-close-v1" aria-label="Close">
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <div className="modal-body-v1">{children}</div>
          {footer && <div className="modal-footer-v1">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
