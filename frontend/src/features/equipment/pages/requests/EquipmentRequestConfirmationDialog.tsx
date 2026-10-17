import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

export function EquipmentRequestConfirmationDialog({
  action, reference, onDismiss,
}: {
  action: 'submitted' | 'updated';
  reference: string;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const okButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { okButtonRef.current?.focus(); }, []);

  const submitted = action === 'submitted';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            okButtonRef.current?.focus();
          }
        }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {submitted ? 'Equipment request submitted' : 'Equipment request updated'}
        </h2>
        <div id={descriptionId} className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>Request reference: <span className="font-mono font-semibold">{reference}</span></p>
          {submitted && <p>Status: Pending Review.</p>}
        </div>
        <div className="mt-6 flex justify-end">
          <Button ref={okButtonRef} onClick={onDismiss}>OK</Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
