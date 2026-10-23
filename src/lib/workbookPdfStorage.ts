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
  id: 'active-workbook';
  type: string;
  data: Blob;
}

const DB_NAME = 'stage-timer-local-workbooks';
const DB_VERSION = 1;
const STORE_NAME = 'workbooks';
const ACTIVE_KEY = 'active-workbook';

const openWorkbookDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('This browser does not support local workbook storage.'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
      id: ACTIVE_KEY,
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

export async function loadWorkbookPdfLocally(): Promise<SavedWorkbookPdf | null> {
  const database = await openWorkbookDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(ACTIVE_KEY) as IDBRequest<WorkbookPdfRecord | undefined>);
    await done;
    if (!record) return null;
    const file = new File([record.data], record.name, { type: record.type, lastModified: record.lastModified });
    return {
      name: record.name,
      size: record.size,
      lastModified: record.lastModified,
      meetingType: record.meetingType,
      file,
    };
  } finally {
    database.close();
  }
}

export async function deleteWorkbookPdfLocally(): Promise<void> {
  const database = await openWorkbookDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    await done;
  } finally {
    database.close();
  }
}
