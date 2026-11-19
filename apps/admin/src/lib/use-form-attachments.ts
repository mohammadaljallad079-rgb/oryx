'use client';

import { useRef, useState } from 'react';
import type { AttachmentDto } from '@oryx/shared';
import type { AttachmentFieldHandle } from '@/components/attachments';

/**
 * Wires a create/edit form to the shared attachment field.
 *
 * Every section's form uses the same three pieces: a draft list, a handle that
 * uploads the picked files once the record id exists, and a reset. Keeping them
 * in one hook means a new form supports attachments in three lines and cannot
 * forget to flush — the failure mode that would silently drop the user's files.
 *
 *   const attach = useFormAttachments();
 *   const created = await api.createThing(...);
 *   await attach.flush(created.id);
 */
export function useFormAttachments(): {
  items: AttachmentDto[];
  setItems: (next: AttachmentDto[]) => void;
  register: (handle: AttachmentFieldHandle | null) => void;
  flush: (entityId?: string) => Promise<AttachmentDto[]>;
  reset: () => void;
} {
  const [items, setItems] = useState<AttachmentDto[]>([]);
  const ref = useRef<AttachmentFieldHandle | null>(null);

  return {
    items,
    setItems,
    register: (handle) => {
      ref.current = handle;
    },
    flush: async (entityId) => (ref.current ? ref.current.flush(entityId) : []),
    reset: () => {
      ref.current?.discard();
      setItems([]);
    },
  };
}
