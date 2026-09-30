// Channel icon — the channel `name` field stores both the display name and
// the icon, as a leading unicode emoji: `"<emoji> <name>"`. Other clients
// render this as `~<emoji>~ <name>`, so the channel name is not broken for
// them. On our side we map each supported emoji to a Phosphor glyph and show
// it in the sidebar, to the left of the display name.
//
// `CHANNEL_ICONS` is the closed set of supported icons (40). A channel name
// is parsed against this set; a leading emoji not in the set is treated as
// plain text (no glyph).

export interface ChannelIcon {
	emoji: string;
	// Phosphor v2 glyph name (@phosphor-icons/web), shown in the sidebar.
	icon: string;
	// Portuguese label, used in the picker.
	label: string;
}

export const CHANNEL_ICONS: ChannelIcon[] = [
	// Comunidade / chat
	{ emoji: '💬', icon: 'chat-circle', label: 'Chat' },
	{ emoji: '👥', icon: 'users-three', label: 'Comunidade' },
	{ emoji: '🎧', icon: 'headphones', label: 'Voz' },
	{ emoji: '🎤', icon: 'microphone-stage', label: 'Palco' },
	{ emoji: '📢', icon: 'megaphone', label: 'Anúncios' },
	{ emoji: '📅', icon: 'calendar-dots', label: 'Eventos' },
	{ emoji: '⭐', icon: 'star', label: 'Favoritos' },
	{ emoji: '✨', icon: 'sparkle', label: 'Destaques' },
	{ emoji: '🌐', icon: 'globe', label: 'Mundo' },
	{ emoji: '☕', icon: 'coffee', label: 'Lounge' },

	// Aero / natureza
	{ emoji: '☁️', icon: 'cloud', label: 'Nuvem' },
	{ emoji: '🌊', icon: 'waves', label: 'Ondas' },
	{ emoji: '🌈', icon: 'rainbow', label: 'Arco-íris' },
	{ emoji: '🌙', icon: 'moon-stars', label: 'Noturno' },
	{ emoji: '🌱', icon: 'plant', label: 'Natureza' },

	// Mídia / tecnologia
	{ emoji: '🎮', icon: 'game-controller', label: 'Jogos' },
	{ emoji: '🎵', icon: 'music-notes', label: 'Música' },
	{ emoji: '🖼️', icon: 'image-square', label: 'Galeria' },
	{ emoji: '🎥', icon: 'video-camera', label: 'Vídeos' },
	{ emoji: '📷', icon: 'camera', label: 'Fotografia' },
	{ emoji: '💻', icon: 'code', label: 'Código' },
	{ emoji: '⌨️', icon: 'terminal-window', label: 'Terminal' },

	// Arte / hobbies criativos
	{ emoji: '🎨', icon: 'palette', label: 'Arte' },
	{ emoji: '🖌️', icon: 'paint-brush', label: 'Pintura' },
	{ emoji: '🎸', icon: 'guitar', label: 'Guitarra' },
	{ emoji: '🎹', icon: 'piano-keys', label: 'Piano' },
	{ emoji: '📚', icon: 'book-open', label: 'Leitura' },
	{ emoji: '✂️', icon: 'scissors', label: 'Artesanato' },
	{ emoji: '🧩', icon: 'puzzle-piece', label: 'Quebra-cabeça' },
	
	// Esportes / atividades
	{ emoji: '⚽', icon: 'soccer-ball', label: 'Futebol' },
	{ emoji: '🏀', icon: 'basketball', label: 'Basquete' },
	{ emoji: '🏐', icon: 'volleyball', label: 'Vôlei' },
	{ emoji: '🚲', icon: 'bicycle', label: 'Ciclismo' },
	{ emoji: '🏃', icon: 'person-simple-run', label: 'Corrida' },
	{ emoji: '🏋️', icon: 'barbell', label: 'Academia' },

	// Outros hobbies
	{ emoji: '🍳', icon: 'cooking-pot', label: 'Culinária' },
	{ emoji: '⛺', icon: 'tent', label: 'Camping' },
	{ emoji: '🧭', icon: 'compass', label: 'Exploração' },
	{ emoji: '✈️', icon: 'airplane-tilt', label: 'Viagens' }
];

export interface ParsedChannelName {
	emoji: string | null;
	icon: string | null;
	name: string;
}

// Parse `"<emoji> <name>"` back into (emoji, icon, name). Returns null for
// the emoji when the leading emoji is not in `CHANNEL_ICONS` (kept as plain
// text).
export function parseChannelName(name: string): ParsedChannelName {
	for (const c of CHANNEL_ICONS) {
		if (name === c.emoji) {
			return { emoji: c.emoji, icon: c.icon, name: '' };
		}
		if (name.startsWith(c.emoji + ' ')) {
			return { emoji: c.emoji, icon: c.icon, name: name.slice(c.emoji.length + 1) };
		}
	}
	return { emoji: null, icon: null, name };
}

// Encode back to the stored form. An empty/null emoji yields the bare name.
export function encodeChannelName(emoji: string | null, name: string): string {
	if (!emoji) {
		return name;
	}
	return emoji + ' ' + name;
}
