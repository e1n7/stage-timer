export const mergeItemById = <T extends { id: string }>(items: T[], nextItem: T): T[] => {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  const nextItems = [...items];
  if (existingIndex >= 0) nextItems[existingIndex] = nextItem;
  else nextItems.push(nextItem);
  return nextItems;
};
