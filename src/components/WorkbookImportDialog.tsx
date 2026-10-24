'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { extractWeekendWeeks, extractWorkbookWeeks, makeWeekendSections, parseWorkbookSchedules, readWorkbookPdf, type MeetingType, type WorkbookSchedule, type WorkbookSection } from '../lib/workbookPdf';
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
  const [dateFallbackNotice, setDateFallbackNotice] = useState(false);
  const [savedPdfs, setSavedPdfs] = useState<Partial<Record<MeetingType, SavedWorkbookPdf>>>({});
  const [savedPdfChecked, setSavedPdfChecked] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const savedPdf = savedPdfs[meeting] || null;

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
    setEditedSectionsByWeek({});
    try {
      const text = await readWorkbookPdf(file);
      const extractedWeeks = fileMeeting === 'Weekend' ? extractWeekendWeeks(text) : extractWorkbookWeeks(text);
      setDateFallbackNotice(!extractedWeeks.length);
      const parsed = fileMeeting === 'Midweek' ? parseWorkbookSchedules(text) : [];
      const availableWeeks = extractedWeeks.length
        ? [...new Set(extractedWeeks)]
        : parsed.length ? parsed.map((schedule) => schedule.week) : ['Week 1'];

      if (persist) {
        const info = await saveWorkbookPdfLocally(file, fileMeeting);
        const saved = { ...info, file };
        const nextSavedPdfs = { ...savedPdfsRef.current, [fileMeeting]: saved };
        savedPdfsRef.current = nextSavedPdfs;
        setSavedPdfs(nextSavedPdfs);
      }

      const parsedByWeek = new Map(parsed.map((schedule) => [schedule.week, schedule.sections]));
      const schedules = availableWeeks.map((item) => ({ week: item, sections: parsedByWeek.get(item) || [] }));
      onWorkbookWeeksChange(fileMeeting, availableWeeks);
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
  }, [onWorkbookWeeksChange]);

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
      setDateFallbackNotice(false);
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
    if (value === meeting) return;
    previewWeekByMeetingRef.current[meeting] = week;
    setMeeting(value);
    meetingRef.current = value;
    setError('');
    setWorkbookSchedules([]);
    setWeek('');
    setEditedSectionsByWeek({});
    setDateFallbackNotice(false);
    const storedPdf = savedPdfsRef.current[value];
    if (storedPdf) void processFile(storedPdf.file, false, value);
    else onWorkbookWeeksChange(value, []);
  };

  const importSchedule = () => {
    const schedules = workbookSchedules.map((schedule) => ({
      week: schedule.week,
      sections: editedSectionsByWeek[schedule.week] || (meeting === 'Weekend' ? makeWeekendSections() : schedule.sections),
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
    onImport(meeting, schedules, week, workbookSchedules.map((schedule) => schedule.week));
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
            <select value={meeting} disabled={!savedPdfChecked || loading} onChange={(event) => updateMeeting(event.target.value as MeetingType)} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              <option>Midweek</option><option>Weekend</option>
            </select>
          </label>
          <label className="text-xs text-[#aaa]">Workbook week
            <select value={week} disabled={!workbookSchedules.length || loading} onChange={(event) => {
              const nextWeek = event.target.value;
              setWeek(nextWeek);
              previewWeekByMeetingRef.current[meeting] = nextWeek;
            }} className="mt-1 block h-10 w-full rounded border border-[#444] bg-[#151515] px-3 text-sm text-white disabled:opacity-60">
              {workbookSchedules.length ? workbookSchedules.map((item) => <option key={item.week}>{item.week}</option>) : <option value="">Upload a PDF to read weeks</option>}
            </select>
          </label>
        </div>
        {dateFallbackNotice && workbookSchedules.length > 0 && <p className="mt-3 rounded bg-[#2a2925] p-3 text-xs text-[#d6c49b]">Printed week dates were not recognized, so sequential week labels were created for this PDF.</p>}
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
