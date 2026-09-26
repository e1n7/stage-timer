export interface TimerHeaderOrder {
  id: string;
  timerIds: string[];
}

/**
 * Returns the visible timer order represented by section placement and
 * top-level placement, followed by any valid orphaned timers.
 */
export const getCanonicalTimerOrder = (
  timerIds: string[],
  timerHeaders: TimerHeaderOrder[],
  topLevelItems: string[],
): string[] => {
  const order: string[] = [];
  const sectionByTimer = new Map<string, string>();
  timerHeaders.forEach((header) => {
    header.timerIds.forEach((timerId) => sectionByTimer.set(timerId, header.id));
  });

  topLevelItems.forEach((item) => {
    if (item.startsWith('header:')) {
      const header = timerHeaders.find((candidate) => `header:${candidate.id}` === item);
      header?.timerIds.forEach((timerId) => {
        if (timerIds.includes(timerId) && !order.includes(timerId)) order.push(timerId);
      });
      return;
    }
    if (timerIds.includes(item) && !sectionByTimer.has(item) && !order.includes(item)) {
      order.push(item);
    }
  });

  timerIds.forEach((timerId) => {
    if (!order.includes(timerId)) order.push(timerId);
  });
  return order;
};
