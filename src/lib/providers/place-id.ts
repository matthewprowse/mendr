export function normalizePlaceId(id: string) {
    return (id || '').replace(/^places\//, '');
}
