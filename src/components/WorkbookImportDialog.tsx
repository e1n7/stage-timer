'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { extractWeekendWeeks, extractWorkbookWeeks, inspectMidweekWorkbook, makeWeekendSections, readWorkbookPdf, type MeetingType, type WorkbookSchedule, type WorkbookSection } from '../lib/workbookPdf';
import { addDefaultMidweekCounseling } from '../lib/workbookPdfDefaults';
import { deleteWorkbookPdfLocally, loadWorkbookPdfsLocally, saveWorkbookPdfLocally, type SavedWorkbookPdf } from '../lib/workbookPdfStorage';

interface Props {
  open: boolean;
  currentMeeting: MeetingType;
  currentWeek: string;
  preferredWeekByType: Partial<Record<MeetingType, string>>;
  onClose: () => void;
  onImport: (meeting: MeetingType, schedules: WorkbookSchedule[], activeWeek: string, workbookWeeks: string[]) => void;
  onDeleteSchedules: (meeting: MeetingType, weeks: string[]) => number;
  onWorkbookWeeksChange: (meeting: MeetingType, weeks: string[]) => void;
}

export default function WorkbookImportDialog({ open, currentMeeting, currentWeek, preferredWeekByType, onClose, onImport, onDeleteSchedules, onWorkbookWeeksChange }: Props) {
  const [meeting, setMeeting] = useState<MeetingType>('Midweek');
  const [week, setWeek] = useState('');
  const [workbookSchedules, setWorkbookSchedules] = useState<WorkbookSchedule[]>([]);
  const [editedSectionsByWeek, setEditedSectionsByWeek] = useState<Record<string, WorkbookSection[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parseNotice, setParseNotice] = useState('');
  const [dateFallbackNotice, setDateFallbackNotice] = useState(false);
  const [invalidMidweekPdf, setInvalidMidweekPdf] = useState(false);
  const [savedPdfs, setSavedPdfs] = useState<Partial<Record<MeetingType, SavedWorkbookPdf>>>({});
  const [savedPdfChecked, setSavedPdfChecked] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const uploadLockRef = useRef(false);
  const savedPdfsRef = useRef<Partial<Record<MeetingType, SavedWorkbookPdf>>>({});
  const meetingRef = useRef(meeting);
  const currentMeetingRef = useRef(currentMeeting);
  const currentWeekRef = useRef(currentWeek);
  const preferredWeekByTypeRef = useRef(preferredWeekByType);
  const previewWeekByMeetingRef = useRef<Partial<Record<MeetingType, string>>>({});
  meetingRef.current = meeting;
  currentMeetingRef.current = currentMeeting;
  currentWeekRef.current = currentWeek;
  preferredWeekByTypeRef.current = preferredWeekByType;
  onCloseRef.current = onClose;
  const savedPdf = savedPdfs[meeting] || null;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    const focusable = getFocusable();
    (focusable[0] || dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const currentFocusable = getFocusable();
      if (!currentFocusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  const processFile = useCallback(async (file: File, persist: boolean, fileMeeting: MeetingType) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Choose a PDF workbook file.');
      return;
    }
    if (uploadLockRef.current) return;
    uploadLockRef.current = true;
    setLoading(true);
    setError('');
    setParseNotice('');
    setDateFallbackNotice(false);
    setInvalidMidweekPdf(false);
    setWorkbookSchedules([]);
    setWeek('');
    setEditedSectionsByWeek({});
    let extractedText = '';
    try {
      extractedText = await readWorkbookPdf(file);
      if (!extractedText.trim()) {
        setError('No readable text could be extracted from this PDF. It may be scanned, image-only, or password-protected; use a text-based workbook PDF.');
        return;
      }

      const extractedWeeks = fileMeeting === 'Weekend' ? extractWeekendWeeks(extractedText) : extractWorkbookWeeks(extractedText);
      let parsed: WorkbookSchedule[] = [];
      let midweekIssue: 'none' | 'no-text' | 'no-agenda' | 'missing-headings' = 'none';
      if (fileMeeting === 'Midweek') {
        const inspection = inspectMidweekWorkbook(extractedText);
        midweekIssue = inspection.issue;
        parsed = addDefaultMidweekCounseling(inspection.schedules);
        if (inspection.issue === 'missing-headings') {
          setParseNotice('Agenda items were recognized, but one or more section headings could not be read. Generic section labels were assigned; review them before importing.');
        }
      }

      const availableWeeks = fileMeeting === 'Midweek'
        ? [...new Set([...extractedWeeks, ...parsed.map((schedule) => schedule.week)])]
        : [...new Set(extractedWeeks)];
      const parsedByWeek = new Map(parsed.map((schedule) => [schedule.week, schedule.sections]));
      const candidateSchedules = availableWeeks.map((item) => ({ week: item, sections: parsedByWeek.get(item) || [] }));
      const missingAgendaCount = candidateSchedules.filter((schedule) => !schedule.sections.length).length;
      const parsedAgendaCount = candidateSchedules.length - missingAgendaCount;
      const wrongMidweekWorkbook = fileMeeting === 'Midweek' && (
        midweekIssue === 'no-agenda'
        || (candidateSchedules.length >= 3 && missingAgendaCount > parsedAgendaCount)
      );
      // Use agenda coverage rather than English-only markers; incomplete false-positive parses are not importable.
      const schedules = wrongMidweekWorkbook ? [] : candidateSchedules;
      setInvalidMidweekPdf(wrongMidweekWorkbook);
      setDateFallbackNotice(fileMeeting === 'Midweek' ? wrongMidweekWorkbook || (parsed.length > 0 && !extractedWeeks.length) : !availableWeeks.length);

      if (persist && !(fileMeeting === 'Midweek' && midweekIssue === 'no-agenda')) {
        try {
          const info = await saveWorkbookPdfLocally(file, fileMeeting);
          const saved = { ...info, file };
          const nextSavedPdfs = { ...savedPdfsRef.current, [fileMeeting]: saved };
          savedPdfsRef.current = nextSavedPdfs;
          setSavedPdfs(nextSavedPdfs);
        } catch (cause) {
          console.error(cause);
          const message = 'The PDF was read, but could not be saved in local browser storage. Check the browser storage quota and try again.';
          setError(message);
          gooeyToast.info('Workbook PDF was not saved', { description: message, showTimestamp: false });
        }
      }

      setWorkbookSchedules(schedules);
      const roomPreferredWeek = preferredWeekByTypeRef.current[fileMeeting]
        || (currentMeetingRef.current === fileMeeting ? currentWeekRef.current : '');
      const previewPreferredWeek = previewWeekByMeetingRef.current[fileMeeting];
      const selectedWeek = schedules.find((schedule) => schedule.week === roomPreferredWeek)?.week
        || schedules.find((schedule) => schedule.week === previewPreferredWeek)?.week
        || schedules[0]?.week
        || '';
      previewWeekByMeetingRef.current[fileMeeting] = selectedWeek;
      setWeek(selectedWeek);
    } catch (cause) {
      console.error(cause);
      const message = extractedText.trim()
        ? 'PDF text was extracted, but schedule parsing failed. Try another text-based workbook PDF or re-upload the file.'
        : persist
          ? 'Could not extract text from this PDF. Make sure it is a valid, unlocked PDF with selectable text.'
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
    setMeeting(currentMeeting);
    meetingRef.current = currentMeeting;
    setSavedPdfChecked(false);
    loadWorkbookPdfsLocally().then(async (storedPdfs) => {
      if (!active) return;
      const savedByMeeting = Object.fromEntries(storedPdfs.map((stored) => [stored.meetingType, stored])) as Partial<Record<MeetingType, SavedWorkbookPdf>>;
      savedPdfsRef.current = savedByMeeting;
      setSavedPdfs(savedByMeeting);
      const selectedMeeting = currentMeeting;
      const selectedPdf = savedByMeeting[selectedMeeting];
      if (selectedPdf) {
        await processFile(selectedPdf.file, false, selectedMeeting);
      } else {
        setWorkbookSchedules([]);
        setWeek('');
        setEditedSectionsByWeek({});
        setDateFallbackNotice(false);
        setInvalidMidweekPdf(false);
        setParseNotice('');
        onWorkbookWeeksChange(selectedMeeting, []);
      }
      if (active) setSavedPdfChecked(true);
    }).catch((cause: unknown) => {
      console.error(cause);
      if (!active) return;
      savedPdfsRef.current = {};
      setSavedPdfs({});
      setSavedPdfChecked(true);
      const message = 'Could not check local workbook storage. You may need to refresh or clear browser site data.';
      setError(message);
      gooeyToast.info('Could not check saved workbook', { description: message, showTimestamp: false });
    });
    return () => { active = false; };
  }, [open, currentMeeting, onWorkbookWeeksChange, processFile]);

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
      gooeyToast.info('A workbook PDF is already saved for this meeting', { description: 'Delete this meeting’s saved PDF before uploading another one.', showTimestamp: false });
      return;
    }
    await processFile(file, true, meeting);
  };

  const deleteSavedPdf = async () => {
    setDeletingPdf(true);
    try {
      await deleteWorkbookPdfLocally(meeting);
      const deletedTimerCount = onDeleteSchedules(meeting, workbookSchedules.map((schedule) => schedule.week));
      onWorkbookWeeksChange(meeting, []);
      const nextSavedPdfs = { ...savedPdfsRef.current };
      delete nextSavedPdfs[meeting];
      savedPdfsRef.current = nextSavedPdfs;
      setSavedPdfs(nextSavedPdfs);
      setSavedPdfChecked(true);
      setWorkbookSchedules([]);
      setWeek('');
      setEditedSectionsByWeek({});
      setError('');
      setParseNotice('');
      setDateFallbackNotice(false);
      setInvalidMidweekPdf(false);
      delete previewWeekByMeetingRef.current[meeting];
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
    return meeting === 'Weekend' ? makeWeekendSections() : selectedSchedule?.sections || [];
  }, [editedSectionsByWeek, meeting, selectedSchedule, week, workbookSchedules.length]);
  const partsCount = useMemo(() => sections.reduce((count, section) => count + section.parts.length, 0), [sections]);
  const missingWeeks = meeting === 'Midweek' ? workbookSchedules.filter((schedule) => !schedule.sections.length).map((schedule) => schedule.week) : [];
  const hasNoParsedMidweekSchedules = meeting === 'Midweek' && workbookSchedules.length > 0 && !workbookSchedules.some((schedule) => schedule.sections.length > 0);

  const updatePart = (sectionIndex: number, partIndex: number, field: 'title' | 'minutes', value: string) => {
    const updated = sections.map((section, index) => index !== sectionIndex ? section : {
      ...section,
      parts: section.parts.map((part, itemIndex) => itemIndex !== partIndex ? part : {
        ...part,
        [field]: field === 'minutes' ? Math.min(60, Math.max(1, Number(value) || 1)) : value,
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
    if (value === meeting) return;
    previewWeekByMeetingRef.current[meeting] = week;
    setMeeting(value);
    meetingRef.current = value;
    setError('');
    setParseNotice('');
    setWorkbookSchedules([]);
    setWeek('');
    setEditedSectionsByWeek({});
    setDateFallbackNotice(false);
    setInvalidMidweekPdf(false);
    const storedPdf = savedPdfsRef.current[value];
    if (storedPdf) void processFile(storedPdf.file, false, value);
    else onWorkbookWeeksChange(value, []);
  };

  const importSchedule = () => {
    const reviewedSchedules = workbookSchedules.map((schedule) => ({
      week: schedule.week,
      sections: editedSectionsByWeek[schedule.week] || (meeting === 'Weekend' ? makeWeekendSections() : schedule.sections),
    })).filter((schedule) => meeting === 'Weekend' || schedule.sections.length > 0);
    const schedules = meeting === 'Midweek' ? addDefaultMidweekCounseling(reviewedSchedules) : reviewedSchedules;

    if (!schedules.length) {
      setError('No timer parts are ready to import yet. Review the PDF or try a text-based workbook.');
      return;
    }
    if (!schedules.some((schedule) => schedule.week === week)) {
      setError('This week has no recognized timers. Select a week with parsed timers before importing.');
      return;
    }
    if (hasNoParsedMidweekSchedules || schedules.some((schedule) => schedule.sections.some((section) => section.parts.some((part) => !part.title.trim() || !Number.isFinite(part.minutes) || part.minutes < 1 || part.minutes > 60)))) {
      setError('Add or confirm a valid title and duration for every part before importing.');
      return;
    }
    onImport(meeting, schedules, week, workbookSchedules.map((schedule) => schedule.week));
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="workbook-import-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#444] bg-[#202020] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 id="workbook-import-title" className="text-lg font-semibold">Import PDF workbook</h2></div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-[#aaa] hover:bg-[#3f1010] hover:text-[#ff3333]" aria-label="Close import dialog">×</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[#aaa]">Meeting type
            <select value={meeting} disabled={!savedPdfChecked || loading} onChange={(event) => updateMeeting(event.target.value as MeetingType)} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              <option>Midweek</option><option>Weekend</option>
            </select>
          </label>
          <label className="text-xs text-[#aaa]">Workbook week
            <select value={week} disabled={!workbookSchedules.length || loading || invalidMidweekPdf} onChange={(event) => {
              const nextWeek = event.target.value;
              setWeek(nextWeek);
              previewWeekByMeetingRef.current[meeting] = nextWeek;
            }} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              {workbookSchedules.length ? workbookSchedules.map((item) => <option key={item.week}>{item.week}</option>) : <option value="">{savedPdf ? 'No readable workbook weeks' : 'Upload a PDF to read weeks'}</option>}
            </select>
          </label>
        </div>
        {invalidMidweekPdf && <p role="status" className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">No week dates were detected. Check that this is the correct Life and Ministry Meeting Workbook PDF.</p>}
        {dateFallbackNotice && !invalidMidweekPdf && <p className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">{meeting === 'Midweek' ? 'No week dates were detected. Parsed agendas are labeled sequentially; review them before importing.' : 'No week dates were detected. Check that this is the correct Watchtower PDF.'}</p>}
        {missingWeeks.length > 0 && !invalidMidweekPdf && <p className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">Some dated weeks could not be read. Only weeks with readable agenda items can be imported.</p>}
        {parseNotice && !invalidMidweekPdf && <p role="status" className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">{parseNotice}</p>}
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
        {loading && <p className="mt-4 text-sm text-[#9fc7ff]">Reading PDF…</p>}
        {error && <p role="alert" className="mt-4 rounded bg-[#351f1f] p-3 text-sm text-[#ffb0b0]">{error}</p>}
        {sections.length > 0 && <div className="mt-4 space-y-3">
          <p className="text-xs text-[#aaa]">{partsCount} timer{partsCount === 1 ? '' : 's'} for {week || 'this week'}. Review or edit titles and durations before importing.</p>
          {sections.map((section, sectionIndex) => <div key={`${section.title}-${sectionIndex}`} className="rounded border border-[#393939] p-3">
            <div className="mb-2 rounded px-3 py-2" style={{ backgroundColor: meeting === 'Weekend' && sectionIndex === 0 ? '#5d719e' : meeting === 'Weekend' && sectionIndex === 1 ? '#8e8e92' : section.color }}>
              <input aria-label="Section heading" value={section.title} onChange={(event) => updateSectionTitle(sectionIndex, event.target.value)} className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none focus:ring-0" />
            </div>
            {section.parts.map((part, partIndex) => <div key={`${part.title}-${partIndex}`} className="mb-2 flex gap-2 last:mb-0">
              <input aria-label="Part title" value={part.title} onChange={(event) => updatePart(sectionIndex, partIndex, 'title', event.target.value)} className="h-9 min-w-0 flex-1 rounded border border-[#444] bg-[#151515] px-2 text-sm text-white" />
              <input aria-label="Duration in minutes" type="number" min="1" max="60" value={part.minutes} onChange={(event) => updatePart(sectionIndex, partIndex, 'minutes', event.target.value)} className="h-9 w-24 rounded border border-[#444] bg-[#151515] px-2 text-sm text-white" />
              <span className="self-center text-xs text-[#888]">min</span>
            </div>)}
          </div>)}
        </div>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="h-9 flex-1 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#383838] max-[639px]:text-[13px]">Cancel</button>
          <button type="button" onClick={importSchedule} disabled={loading || invalidMidweekPdf || !savedPdf || !workbookSchedules.length || (meeting === 'Midweek' && !workbookSchedules.some((schedule) => schedule.sections.length > 0))} className="h-9 flex-1 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[13px] font-bold text-[#4a9eff] transition-colors hover:border-[#2563eb] hover:bg-[#2563eb] hover:text-white focus-visible:border-[#2563eb] focus-visible:bg-[#2563eb] focus-visible:text-white active:bg-[#1d4ed8] active:text-white max-[639px]:text-[13px] disabled:cursor-not-allowed disabled:opacity-50">Import {workbookSchedules.length > 1 ? `${workbookSchedules.length} weeks` : 'schedule'}</button>
        </div>
      </div>
    </div>
  );
}
