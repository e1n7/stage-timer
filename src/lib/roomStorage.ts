export const mergeItemById = <T extends { id: string }>(items: T[], nextItem: T): T[] => {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  const nextItems = [...items];
  if (existingIndex >= 0) nextItems[existingIndex] = nextItem;
  else nextItems.push(nextItem);
  return nextItems;
};

export const mergeItemsById = <T extends { id: string }>(items: T[], nextItems: T[]): T[] => {
  return nextItems.reduce(mergeItemById, items);
};
