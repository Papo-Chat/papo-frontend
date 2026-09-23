// Time formatting for the UI. The mockup uses "Hoje às HH:MM" for today.

export function formatTime(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	if (d.toDateString() === now.toDateString()) {
		return `Hoje às ${hh}:${mm}`;
	}
	const date = d.toLocaleDateString('pt-BR', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
	return `${date} ${hh}:${mm}`;
}
