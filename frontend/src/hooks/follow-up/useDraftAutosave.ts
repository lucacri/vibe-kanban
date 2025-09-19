import { useEffect, useRef, useState } from 'react';
import { attemptsApi, type UpdateFollowUpDraftRequest } from '@/lib/api';
import type { FollowUpDraft } from 'shared/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'sent';

type DraftData = Pick<FollowUpDraft, 'prompt' | 'variant' | 'image_ids'>;

type Args = {
  attemptId?: string;
  serverDraft: FollowUpDraft | null;
  current: DraftData;
  isQueuedUI: boolean;
  isDraftSending: boolean;
  isQueuing: boolean;
  isUnqueuing: boolean;
  suppressNextSaveRef: React.MutableRefObject<boolean>;
  lastServerVersionRef: React.MutableRefObject<number>;
  forceNextApplyRef: React.MutableRefObject<boolean>;
};

export function useDraftAutosave({
  attemptId,
  serverDraft,
  current,
  isQueuedUI,
  isDraftSending,
  isQueuing,
  isUnqueuing,
  suppressNextSaveRef,
  lastServerVersionRef,
  forceNextApplyRef,
}: Args) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // Presentation timers moved to FollowUpStatusRow; keep only raw status.

  // debounced save
  const lastSentRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!attemptId) return;
    if (isDraftSending) return;
    if (isQueuing || isUnqueuing) return;
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false;
      return;
    }
    if (isQueuedUI) return;

    const saveDraft = async () => {
      const payload: Partial<UpdateFollowUpDraftRequest> = {};
      if (serverDraft && current.prompt !== (serverDraft.prompt || ''))
        payload.prompt = current.prompt || '';
      if ((serverDraft?.variant ?? null) !== (current.variant ?? null))
        payload.variant = (current.variant ?? null) as string | null;
      const currentIds = (current.image_ids as string[] | null) ?? [];
      const serverIds = (serverDraft?.image_ids as string[] | undefined) ?? [];
      const idsEqual =
        currentIds.length === serverIds.length &&
        currentIds.every((id, i) => id === serverIds[i]);
      if (!idsEqual) payload.image_ids = currentIds;
      const keys = Object.keys(payload);
      if (keys.length === 0) return;
      const payloadKey = JSON.stringify(payload);
      if (payloadKey === lastSentRef.current) return;
      lastSentRef.current = payloadKey;
      try {
        setIsSaving(true);
        setSaveStatus(navigator.onLine ? 'saving' : 'offline');
        await attemptsApi.saveFollowUpDraft(
          attemptId,
          payload as UpdateFollowUpDraftRequest
        );
        setSaveStatus('saved');
      } catch {
        try {
          // Fetch latest server draft to ensure stream catches up,
          // and force next apply to override local edits when it arrives.
          await attemptsApi.getFollowUpDraft(attemptId);
          suppressNextSaveRef.current = true;
          forceNextApplyRef.current = true;
        } catch {
          /* ignore */
        }
        setSaveStatus(navigator.onLine ? 'idle' : 'offline');
      } finally {
        setIsSaving(false);
      }
    };
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(saveDraft, 400);
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [
    attemptId,
    serverDraft?.prompt,
    serverDraft?.variant,
    serverDraft?.image_ids,
    current.prompt,
    current.variant,
    current.image_ids,
    isQueuedUI,
    isDraftSending,
    isQueuing,
    isUnqueuing,
    suppressNextSaveRef,
    lastServerVersionRef,
  ]);

  return { isSaving, saveStatus } as const;
}
