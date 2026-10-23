'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { extractWorkbookWeeks, makeWeekendSections, parseWorkbookSchedules, readWorkbookPdf, type MeetingType, type WorkbookSchedule, type WorkbookSection } from '../lib/workbookPdf';
import { deleteWorkbookPdfLocally, loadWorkbookPdfLocally, saveWorkbookPdfLocally, type SavedWorkbookPdfInfo } from '../lib/workbookPdfStorage';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (meeting: MeetingType, schedules: WorkbookSchedule[], activeWeek: string) => void;
  onDeleteSchedules: (meeting: MeetingType, weeks: string[]) => number;
}

const getFileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

export default function WorkbookImportDialog({ open, onClose, onImport, onDeleteSchedules }: Props) {
  const [meeting, setMeeting] = useState<MeetingType>('Midweek');
  const [week, setWeek] = useState('');
  const [weekTitleDraft, setWeekTitleDraft] = useState('');
  const [workbookSchedules, setWorkbookSchedules] = useState<WorkbookSchedule[]>([]);
  const [editedSectionsByWeek, setEditedSectionsByWeek] = useState<Record<string, WorkbookSection[]>>({});
  const [talkTitle, setTalkTitle] = useState('Public Talk');
  const [studyTitle, setStudyTitle] = useState('Watchtower Study');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateFallbackNotice, setDateFallbackNotice] = useState(false);
  const [savedPdf, setSavedPdf] = useState<SavedWorkbookPdfInfo | null>(null);
  const [savedPdfChecked, setSavedPdfChecked] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastProcessedFileRef = useRef<string | null>(null);
  const uploadLockRef = useRef(false);

  const processFile = useCallback(async (file: File, persist: boolean, fileMeeting: MeetingType) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Choose a PDF workbook file.');
      return;
    }
    if (uploadLockRef.current) return;
    uploadLockRef.current = true;
    setLoading(true);
    setError('');
    setDateFallbackNotice(false);
    setWorkbookSchedules([]);
    setWeek('');
    setWeekTitleDraft('');
    setEditedSectionsByWeek({});
    try {
      const text = await readWorkbookPdf(file);
      const extractedWeeks = extractWorkbookWeeks(text);
      setDateFallbackNotice(!extractedWeeks.length);
      const parsed = parseWorkbookSchedules(text);
      const availableWeeks = extractedWeeks.length
        ? extractedWeeks
        : parsed.length ? parsed.map((schedule) => schedule.week) : ['Week 1'];

      if (persist) {
        const info = await saveWorkbookPdfLocally(file, fileMeeting);
        setSavedPdf(info);
      }
      lastProcessedFileRef.current = getFileKey(file);

      const parsedByWeek = new Map(parsed.map((schedule) => [schedule.week, schedule.sections]));
      const schedules = availableWeeks.map((item) => ({ week: item, sections: parsedByWeek.get(item) || [] }));
      setWorkbookSchedules(schedules);
      setWeek(schedules[0]?.week || '');
      setWeekTitleDraft(schedules[0]?.week || '');
      if (fileMeeting === 'Midweek' && schedules.every((schedule) => !schedule.sections.length)) {
        setError('No timed Midweek parts were recognized. Review the file or try a text-based workbook.');
      }
    } catch (cause) {
      console.error(cause);
      const message = persist
        ? 'Could not read or save this PDF in local browser storage. Try another PDF or check the browser storage quota.'
        : 'Could not read the saved workbook PDF. Delete it and upload the PDF again.';
      setError(message);
      if (persist) gooeyToast.info('Workbook PDF was not saved', { description: message, showTimestamp: false });
    } finally {
      uploadLockRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setSavedPdfChecked(false);
    loadWorkbookPdfLocally().then(async (stored) => {
      if (!active) return;
      if (!stored) {
        setSavedPdf(null);
        setSavedPdfChecked(true);
        return;
      }
      const { file, ...info } = stored;
      setSavedPdf(info);
      setMeeting(stored.meetingType);
      if (lastProcessedFileRef.current !== getFileKey(file)) {
        await processFile(file, false, stored.meetingType);
      }
      if (active) setSavedPdfChecked(true);
    }).catch((cause: unknown) => {
      console.error(cause);
      if (!active) return;
      setSavedPdf(null);
      setSavedPdfChecked(true);
      const message = 'Could not check local workbook storage. You may need to refresh or clear browser site data.';
      setError(message);
      gooeyToast.info('Could not check saved workbook', { description: message, showTimestamp: false });
    });
    return () => { active = false; };
  }, [open, processFile]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (uploadLockRef.current || loading) {
      gooeyToast.info('PDF is being processed', { description: 'Wait for the current workbook upload to finish.', showTimestamp: false });
      return;
    }
    if (!savedPdfChecked) {
      gooeyToast.info('Checking saved workbook', { description: 'Please wait a moment before selecting a PDF.', showTimestamp: false });
      return;
    }
    if (savedPdf) {
      gooeyToast.info('A workbook PDF is already saved', { description: 'Delete the saved PDF before uploading another one.', showTimestamp: false });
      return;
    }
    await processFile(file, true, meeting);
  };

  const deleteSavedPdf = async () => {
    setDeletingPdf(true);
    try {
      await deleteWorkbookPdfLocally();
      const deletedTimerCount = onDeleteSchedules(savedPdf?.meetingType || meeting, workbookSchedules.map((schedule) => schedule.week));
      setSavedPdf(null);
      setSavedPdfChecked(true);
      setWorkbookSchedules([]);
      setWeek('');
      setWeekTitleDraft('');
      setEditedSectionsByWeek({});
      setError('');
      setDateFallbackNotice(false);
      lastProcessedFileRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
      const description = deletedTimerCount
        ? `${deletedTimerCount} imported timer${deletedTimerCount === 1 ? '' : 's'} from this PDF were deleted.`
        : 'The PDF was deleted. No imported timers were found for its week dates.';
      gooeyToast.info('Workbook PDF deleted', { description, showTimestamp: false });
    } catch (cause) {
      console.error(cause);
      gooeyToast.info('Could not delete workbook PDF', { description: 'The saved PDF is still in local browser storage. Please try again.', showTimestamp: false });
    } finally {
      setDeletingPdf(false);
    }
  };

  const selectedSchedule = workbookSchedules.find((schedule) => schedule.week === week);
  const sections = useMemo(() => {
    if (editedSectionsByWeek[week]) return editedSectionsByWeek[week];
    if (!workbookSchedules.length) return [];
    return meeting === 'Weekend' ? makeWeekendSections(talkTitle, studyTitle) : selectedSchedule?.sections || [];
  }, [editedSectionsByWeek, meeting, selectedSchedule, studyTitle, talkTitle, week, workbookSchedules.length]);
  const partsCount = useMemo(() => sections.reduce((count, section) => count + section.parts.length, 0), [sections]);
  const missingWeeks = meeting === 'Midweek' ? workbookSchedules.filter((schedule) => !schedule.sections.length).map((schedule) => schedule.week) : [];
  const hasNoParsedMidweekSchedules = meeting === 'Midweek' && workbookSchedules.length > 0 && !workbookSchedules.some((schedule) => schedule.sections.length > 0);

  const updatePart = (sectionIndex: number, partIndex: number, field: 'title' | 'minutes', value: string) => {
    const updated = sections.map((section, index) => index !== sectionIndex ? section : {
      ...section,
      parts: section.parts.map((part, itemIndex) => itemIndex !== partIndex ? part : {
        ...part,
        [field]: field === 'minutes' ? Math.max(1, Number(value) || 1) : value,
      }),
    });
    setEditedSectionsByWeek((current) => ({ ...current, [week]: updated }));
  };

  const updateSectionTitle = (sectionIndex: number, value: string) => {
    const updated = sections.map((section, index) => index !== sectionIndex ? section : {
      ...section,
      title: value,
      parts: section.parts.map((part) => ({ ...part, section: value })),
    });
    setEditedSectionsByWeek((current) => ({ ...current, [week]: updated }));
  };

  const updateMeeting = (value: MeetingType) => {
    setMeeting(value);
    setError('');
  };

  const commitWeekTitle = () => {
    const updatedWeek = weekTitleDraft.trim();
    if (!week || !updatedWeek) {
      setWeekTitleDraft(week);
      return;
    }
    if (workbookSchedules.some((schedule) => schedule.week === updatedWeek && schedule.week !== week)) {
      setError('That week title is already in this workbook. Choose a unique label.');
      setWeekTitleDraft(week);
      return;
    }
    setWorkbookSchedules((current) => current.map((schedule) => schedule.week === week ? { ...schedule, week: updatedWeek } : schedule));
    setEditedSectionsByWeek((current) => {
      const existing = current[week];
      if (!existing) return current;
      const next = { ...current, [updatedWeek]: existing };
      delete next[week];
      return next;
    });
    setWeek(updatedWeek);
    setWeekTitleDraft(updatedWeek);
    setError('');
  };

  const importSchedule = () => {
    const schedules = workbookSchedules.map((schedule) => ({
      week: schedule.week,
      sections: editedSectionsByWeek[schedule.week] || (meeting === 'Weekend' ? makeWeekendSections(talkTitle, studyTitle) : schedule.sections),
    })).filter((schedule) => meeting === 'Weekend' || schedule.sections.length > 0);

    if (!schedules.length) {
      setError('No timer parts are ready to import yet. Review the PDF or try a text-based workbook.');
      return;
    }
    if (!schedules.some((schedule) => schedule.week === week)) {
      setError('This week has no recognized timers. Select a week with parsed timers before importing.');
      return;
    }
    if (hasNoParsedMidweekSchedules || schedules.some((schedule) => schedule.sections.some((section) => section.parts.some((part) => !part.title.trim() || part.minutes < 1)))) {
      setError('Add or confirm a valid title and duration for every part before importing.');
      return;
    }
    onImport(meeting, schedules, week);
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="workbook-import-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#444] bg-[#202020] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 id="workbook-import-title" className="text-lg font-semibold">Import PDF workbook</h2></div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-[#aaa] hover:bg-[#3f1010] hover:text-[#ff3333]" aria-label="Close import dialog">×</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[#aaa]">Meeting type
            <select value={meeting} disabled={!savedPdfChecked || Boolean(savedPdf)} onChange={(event) => updateMeeting(event.target.value as MeetingType)} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              <option>Midweek</option><option>Weekend</option>
            </select>
          </label>
          <label className="text-xs text-[#aaa]">Workbook week to preview
            <select value={week} disabled={!workbookSchedules.length || loading} onChange={(event) => { setWeek(event.target.value); setWeekTitleDraft(event.target.value); }} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              {workbookSchedules.length ? workbookSchedules.map((item) => <option key={item.week}>{item.week}</option>) : <option value="">Upload a PDF to read weeks</option>}
            </select>
          </label>
        </div>
        {workbookSchedules.length > 0 && <label className="mt-3 block text-xs text-[#aaa]">Week date or title (editable)
          <input
            value={weekTitleDraft}
            onChange={(event) => setWeekTitleDraft(event.target.value)}
            onBlur={commitWeekTitle}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitWeekTitle(); } }}
            className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white"
            aria-label="Editable week date or title"
          />
        </label>}
        {dateFallbackNotice && workbookSchedules.length > 0 && <p className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">Printed week dates were not recognized. Sequential week labels were created; edit the selected week title above before importing.</p>}
        {missingWeeks.length > 0 && <p className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">No timers were recognized for {missingWeeks.join('; ')}. Those weeks are skipped so existing schedules are not replaced with blank ones.</p>}
        <label className="mt-4 block text-xs text-[#aaa]">{meeting === 'Midweek' ? 'Life and Ministry Meeting Workbook PDF' : 'The Watchtower PDF'}
          {savedPdf ? <span className="mt-1 flex h-10 items-center gap-2 rounded border border-[#444] bg-[#151515] px-2">
            <button type="button" title="Delete the saved PDF before uploading another" onClick={() => gooeyToast.info('A workbook PDF is already saved', { description: 'Delete the saved PDF before uploading another one.', showTimestamp: false })} className="min-w-0 flex-1 truncate text-left text-sm text-white hover:text-[#9fc7ff]">{savedPdf.name}</button>
            <button type="button" onClick={deleteSavedPdf} disabled={deletingPdf || loading || !savedPdfChecked} aria-label="Delete uploaded PDF" title="Delete PDF" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-[#aaa] hover:bg-[#3f1010] hover:text-[#ff3333] disabled:opacity-50">×</button>
          </span> : !savedPdfChecked ? <span className="mt-1 flex h-10 items-center rounded border border-[#444] bg-[#151515] px-3 text-sm text-[#888]">Checking saved PDF…</span> : <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onClick={(event) => {
              if (uploadLockRef.current || loading) {
                event.preventDefault();
                gooeyToast.info('PDF is being processed', { description: 'Wait for the current workbook upload to finish.', showTimestamp: false });
              }
            }}
            onChange={(event) => {
              const input = event.currentTarget;
              void handleFile(input.files?.[0]).finally(() => { input.value = ''; });
            }}
            className="mt-1 block w-full rounded border border-[#444] bg-[#151515] p-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-[#303030] file:px-3 file:py-1 file:text-white"
          />}
        </label>
        {meeting === 'Weekend' && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[#aaa]">Public Talk timer title<input value={talkTitle} onChange={(event) => setTalkTitle(event.target.value)} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white" /></label>
          <label className="text-xs text-[#aaa]">Watchtower Study timer title<input value={studyTitle} onChange={(event) => setStudyTitle(event.target.value)} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white" /></label>
        </div>}
        {loading && <p className="mt-4 text-sm text-[#9fc7ff]">Reading PDF…</p>}
        {error && <p role="alert" className="mt-4 rounded border border-[#754040] bg-[#351f1f] p-3 text-sm text-[#ffb0b0]">{error}</p>}
        {sections.length > 0 && <div className="mt-4 space-y-3">
          <p className="text-xs text-[#aaa]">{partsCount} timer{partsCount === 1 ? '' : 's'} for {week || 'this week'}. Review or edit titles and durations before importing.</p>
          {sections.map((section, sectionIndex) => <div key={`${section.title}-${sectionIndex}`} className="rounded border border-[#393939] p-3">
            <div className="mb-2 rounded px-3 py-2" style={{ backgroundColor: section.color }}>
              <input aria-label="Section heading" value={section.title} onChange={(event) => updateSectionTitle(sectionIndex, event.target.value)} className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none focus:ring-0" />
            </div>
            {section.parts.map((part, partIndex) => <div key={`${part.title}-${partIndex}`} className="mb-2 flex gap-2 last:mb-0">
              <input aria-label="Part title" value={part.title} onChange={(event) => updatePart(sectionIndex, partIndex, 'title', event.target.value)} className="h-9 min-w-0 flex-1 rounded border border-[#444] bg-[#151515] px-2 text-sm text-white" />
              <input aria-label="Duration in minutes" type="number" min="1" max="60" value={part.minutes} onChange={(event) => updatePart(sectionIndex, partIndex, 'minutes', event.target.value)} className="h-9 w-24 rounded border border-[#444] bg-[#151515] px-2 text-sm text-white" />
              <span className="self-center text-xs text-[#888]">min</span>
            </div>)}
          </div>)}
        </div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[#444] px-4 py-2 text-sm text-white hover:bg-[#333]">Cancel</button>
          <button type="button" onClick={importSchedule} disabled={loading || !savedPdf || !workbookSchedules.length || (meeting === 'Midweek' && !workbookSchedules.some((schedule) => schedule.sections.length > 0))} className="rounded bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50">Import {workbookSchedules.length > 1 ? `${workbookSchedules.length} weeks` : 'schedule'}</button>
        </div>
      </div>
    </div>
  );
}
