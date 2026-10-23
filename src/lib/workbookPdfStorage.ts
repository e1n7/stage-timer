export type SavedWorkbookMeetingType = 'Midweek' | 'Weekend';

export interface SavedWorkbookPdfInfo {
  name: string;
  size: number;
  lastModified: number;
  meetingType: SavedWorkbookMeetingType;
}

export interface SavedWorkbookPdf extends SavedWorkbookPdfInfo {
  file: File;
}

interface WorkbookPdfRecord extends SavedWorkbookPdfInfo {
  id: SavedWorkbookMeetingType | 'active-workbook';
  type: string;
  data: Blob;
}

const DB_NAME = 'stage-timer-local-workbooks';
const DB_VERSION = 2;
const STORE_NAME = 'workbooks';
const LEGACY_KEY = 'active-workbook';

const isMeetingType = (value: unknown): value is SavedWorkbookMeetingType => value === 'Midweek' || value === 'Weekend';

const openWorkbookDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('This browser does not support local workbook storage.'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (event) => {
    const database = request.result;
    const transaction = request.transaction;
    const store = database.objectStoreNames.contains(STORE_NAME)
      ? transaction?.objectStore(STORE_NAME)
      : database.createObjectStore(STORE_NAME, { keyPath: 'id' });

    if (event.oldVersion > 0 && event.oldVersion < 2 && store) {
      const legacyRequest = store.get(LEGACY_KEY) as IDBRequest<WorkbookPdfRecord | undefined>;
      legacyRequest.onsuccess = () => {
        const legacyRecord = legacyRequest.result;
        if (legacyRecord && isMeetingType(legacyRecord.meetingType)) {
          store.put({ ...legacyRecord, id: legacyRecord.meetingType });
        }
        store.delete(LEGACY_KEY);
      };
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Could not open local workbook storage.'));
  request.onblocked = () => reject(new Error('Local workbook storage is busy in another tab.'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('Local workbook storage failed.'));
  transaction.onabort = () => reject(transaction.error || new Error('Local workbook storage was interrupted.'));
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Could not read local workbook storage.'));
});

export async function saveWorkbookPdfLocally(file: File, meetingType: SavedWorkbookMeetingType): Promise<SavedWorkbookPdfInfo> {
  const database = await openWorkbookDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const record: WorkbookPdfRecord = {
      id: meetingType,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      meetingType,
      type: file.type || 'application/pdf',
      data: file.slice(0, file.size, file.type || 'application/pdf'),
    };
    transaction.objectStore(STORE_NAME).put(record);
    await done;
    const { id: _id, type: _type, data: _data, ...info } = record;
    return info;
  } finally {
    database.close();
  }
}

export async function loadWorkbookPdfsLocally(): Promise<SavedWorkbookPdf[]> {
  const database = await openWorkbookDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll() as IDBRequest<WorkbookPdfRecord[]>);
    await done;

    const recordsByMeeting = new Map<SavedWorkbookMeetingType, WorkbookPdfRecord>();
    for (const record of records) {
      const meetingType = record.id === LEGACY_KEY ? record.meetingType : record.id;
      if (!isMeetingType(meetingType)) continue;
      const existing = recordsByMeeting.get(meetingType);
      if (!existing || record.id === meetingType) recordsByMeeting.set(meetingType, record);
    }

    return [...recordsByMeeting.values()].map((record) => ({
      name: record.name,
      size: record.size,
      lastModified: record.lastModified,
      meetingType: record.meetingType,
      file: new File([record.data], record.name, { type: record.type, lastModified: record.lastModified }),
    }));
  } finally {
    database.close();
  }
}

export async function deleteWorkbookPdfLocally(meetingType: SavedWorkbookMeetingType): Promise<void> {
  const database = await openWorkbookDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    store.delete(meetingType);
    const legacyRequest = store.get(LEGACY_KEY) as IDBRequest<WorkbookPdfRecord | undefined>;
    legacyRequest.onsuccess = () => {
      if (legacyRequest.result?.meetingType === meetingType) store.delete(LEGACY_KEY);
    };
    await done;
  } finally {
    database.close();
  }
}
