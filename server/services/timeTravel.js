export function wasActiveAt(memory, asOf) {
  const at = asOf.getTime();
  const createdAt = new Date(memory.createdAt).getTime();
  const changedAt = new Date(memory.statusChangedAt ?? memory.updatedAt ?? memory.createdAt).getTime();
  return createdAt <= at && (memory.status === 'active' || changedAt > at);
}
