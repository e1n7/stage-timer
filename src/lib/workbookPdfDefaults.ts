import type { WorkbookSchedule, WorkbookSection } from './workbookPdf';

const COUNSELING_TITLE = 'Counseling';
const SECTION_TWO_COLOR = '#946F2B';

const isCounselingPart = (title: string) => title.trim().toLocaleLowerCase() === COUNSELING_TITLE.toLocaleLowerCase();

export function addDefaultMidweekCounseling(schedules: WorkbookSchedule[]): WorkbookSchedule[] {
  return schedules.map((schedule) => {
    const sections = schedule.sections.map((section) => ({ ...section, parts: [...section.parts] }));
    const secondSection: WorkbookSection = sections[1] || {
      title: 'Section 2',
      color: SECTION_TWO_COLOR,
      parts: [],
    };
    const existingCounseling = secondSection.parts.find((part) => isCounselingPart(part.title));
    const counselingPart = {
      ...(existingCounseling || {}),
      title: COUNSELING_TITLE,
      minutes: 1,
      section: secondSection.title,
    };
    secondSection.parts = [
      counselingPart,
      ...secondSection.parts.filter((part) => !isCounselingPart(part.title)),
    ];

    if (sections[1]) sections[1] = secondSection;
    else sections.push(secondSection);

    return { ...schedule, sections };
  });
}
