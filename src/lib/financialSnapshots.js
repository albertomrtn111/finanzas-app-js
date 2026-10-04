export function latestByAccount(records, throughDate = null) {
    const latest = {};
    for (const record of records) {
        if (!record?.account || typeof record.date !== 'string') continue;
        const date = record.date.slice(0, 10);
        if (throughDate && date > throughDate) continue;
        const previous = latest[record.account];
        if (!previous || date > previous.date.slice(0, 10) ||
            (date === previous.date.slice(0, 10) && record.id > previous.id)) {
            latest[record.account] = record;
        }
    }
    return latest;
}

export function totalLatestValue(records, throughDate = null) {
    return Object.values(latestByAccount(records, throughDate))
        .reduce((total, record) => total + Number(record.current_value || 0), 0);
}
