import type { VinylRecord } from './types';

export type RecordDetailController = {
  open: (record: VinylRecord, initialEditing?: boolean) => void;
  close: () => void;
};

let controller: RecordDetailController | null = null;

export function setRecordDetailController(next: RecordDetailController | null): void {
  controller = next;
}

export function openRecordDetail(
  record: VinylRecord,
  initialEditing = false
): void {
  controller?.open(record, initialEditing);
}

/** @deprecated Use openRecordDetail(record, false) */
export function openRecordDetailForView(record: VinylRecord): void {
  openRecordDetail(record, false);
}

/** @deprecated Use openRecordDetail(record, true) */
export function openRecordDetailForEdit(record: VinylRecord): void {
  openRecordDetail(record, true);
}

export function closeRecordDetail(): void {
  controller?.close();
}