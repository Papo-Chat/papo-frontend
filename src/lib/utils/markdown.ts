// Rendering of message content: CommonMark + GFM (strikethrough and tables),
// with friendly line breaks (\n -> br). No support for raw HTML: all <tag>
// tokens (block and inline) are stripped before rendering.
//
// Pipeline: marked (gfm, breaks) + custom renderer:
//   - html tokens are discarded;
//   - :name: shortcodes resolve to the server's custom emojis (unknown names
//     are preserved as-is);
//   - text is always escaped (input is never trusted).
import { marked, Renderer } from 'marked';
import { emojiUrl } from '$lib/store/emojis.svelte';
import type { Emoji } from '$lib/types';
import type { Tokens } from 'marked';

type EmojiNameMap = Map<string, Emoji>;
const BLANK_LINE_MARKER = 'PAPOMESSAGEBLANKLINETOKEN';
export interface MessageMarkdownOptions { mentions?: ReadonlyMap<string, string>; highlightEveryone?: boolean; }
type TextToken = { kind: 'text'; value: string };
type EmojiToken = { kind: 'emoji'; name: string; emoji: Emoji };

// Tokenizes content into text fragments + known :name: emojis.
// Unknown names remain as-is (e.g. :x:). Pure function.
function tokenize(content: string, nameMap: EmojiNameMap): {
	tokens: Array<TextToken | EmojiToken>;
	hasText: boolean;
} {
	const re = /:([A-Za-z0-9_]+):/g;
	const tokens: Array<TextToken | EmojiToken> = [];
	let last = 0;
	let m: RegExpExecArray | null;
	let hasText = false;
	while ((m = re.exec(content)) !== null) {
		const start = m.index;
		if (start > last) {
			tokens.push({ kind: 'text', value: content.slice(last, start) });
			hasText = true;
		}
		const name = m[1];
		const emoji = nameMap.get(name);
		if (emoji) {
			tokens.push({ kind: 'emoji', name, emoji });
		} else {
			tokens.push({ kind: 'text', value: m[0] });
		}
		last = m.index + m[0].length;
	}
	if (last < content.length) {
		tokens.push({ kind: 'text', value: content.slice(last) });
		hasText = true;
	}
	return { tokens, hasText };
}

// Escapes like the marked default renderer (preserving existing &#ref;).
const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][A-Fa-f0-9]{1,6}|\w+);)/;
const escapeMap: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeText(s: string): string {
	if (!escapeTestNoEncode.test(s)) {
		return s;
	}
	return s.replace(escapeTestNoEncode, (c) => escapeMap[c]);
}

// Chat input is intentionally forgiving: three backticks always mean a
// fenced code block, even when the opening/closing fence is attached to the
// content (for example: ```{"ok":true}``` or ```\nfoo```).
// Single backticks are left untouched and remain inline code.
function normalizeFencedCodeBlocks(content: string): string {
	return content.replace(/```([\s\S]*?)```/g, (match, rawInner: string, offset: number, source: string) => {
		const inner = rawInner.replace(/\r\n?/g, '\n');
		let info = '';
		let body = inner;

		if (body.startsWith('\n')) {
			body = body.slice(1);
		} else {
			const firstBreak = body.indexOf('\n');
			if (firstBreak >= 0) {
				const possibleInfo = body.slice(0, firstBreak).trim();
				if (/^[A-Za-z0-9_.+-]+$/.test(possibleInfo)) {
					info = possibleInfo;
					body = body.slice(firstBreak + 1);
				}
			}
		}

		if (body.endsWith('\n')) body = body.slice(0, -1);

		const before = offset > 0 && source[offset - 1] !== '\n' ? '\n' : '';
		const afterIndex = offset + match.length;
		const after = afterIndex < source.length && source[afterIndex] !== '\n' ? '\n' : '';

		return `${before}\`\`\`${info}\n${body}\n\`\`\`${after}`;
	});
}

function preserveBlankLines(content: string): string {
	return content
		.split(/(```[\s\S]*?```)/g)
		.map((segment, index) => {
			if (index % 2 === 1) return segment;
			return segment.replace(/\n{2,}/g, (run) => {
				const markers = Array.from(
					{ length: run.length - 1 },
					() => BLANK_LINE_MARKER
				).join('\n\n');
				return `\n\n${markers}\n\n`;
			});
		})
		.join('');
}

// Safe navigation schemes for message links (same reasoning as
// markdown renderers that block javascript:/vbscript:).
const SAFE_LINK_SCHEMES = ['http', 'https', 'mailto'];

function isSafeHref(href: string): boolean {
	if (!href) {
		return false;
	}
	if (href.startsWith('#') || href.startsWith('/')) {
		return true;
	}
	const m = href.match(/^([a-z][a-z0-9+.-]*):/i);
	if (!m) {
		return false;
	}
	return SAFE_LINK_SCHEMES.includes(m[1].toLowerCase());
}

function makeRenderer(
	nameMap: EmojiNameMap,
	hasText: boolean,
	urlFn: (emoji: Emoji) => string,
	options: MessageMarkdownOptions
): Renderer {
	const r = new marked.Renderer({});
	// No support for raw HTML: discard all block and inline tags.
	r.html = () => '';
	r.paragraph = function (token: Tokens.Paragraph): string {
		if (token.text === BLANK_LINE_MARKER) {
			return '<div class="message-blank-line" aria-hidden="true"></div>\n';
		}
		return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
	};
	// Block dangerous link schemes (javascript:, vbscript:, data:, file:…).
	// The rendered HTML is injected via innerHTML, so a <a href> with a
	// non-HTTP scheme would execute code in the page on click.
	// Regular function (not arrow): `this.parser` is the parser wired up by
	// marked before the tokens are rendered.
	r.link = function (token: Tokens.Link): string {
		const { href, title, text, tokens, autolink } = token;
		const linkText = autolink
			? escapeText(text)
			: this.parser.parseInline(tokens);
		if (!isSafeHref(href)) {
			return linkText;
		}
		let anchor = `<a href="${encodeURI(href)}" target="_blank" rel="noopener noreferrer"`;
		if (title) {
			anchor += ` title="${encodeURI(title)}"`;
		}
		return `${anchor}>${linkText}</a>`;
	}
	r.text = (token: Tokens.Text | Tokens.Escape): string => {
		// Text inside raw HTML blocks is discarded too.
		if ('escaped' in token && token.escaped) {
			return '';
		}
		const mentionPattern = /@mention\(<@([0-9a-fA-F-]{16,})>\)|@everyone\b/g;
		let source = token.text;
		const placeholders = new Map<string, string>();
		source = source.replace(mentionPattern, (raw, userId: string | undefined) => {
			const key = `MENTIONTOKEN${placeholders.size}TOKEN`;
			if (userId) {
				const label = options.mentions?.get(userId) ?? 'usuário';
				placeholders.set(key, `<button type="button" class="message-mention" data-mention-user-id="${escapeText(userId)}">@${escapeText(label)}</button>`);
			} else {
				placeholders.set(key, options.highlightEveryone ? '<span class="message-mention message-mention-everyone">@everyone</span>' : '@everyone');
			}
			return key;
		});
		const { tokens } = tokenize(source, nameMap);
		return tokens
			.map((t) => {
				if (t.kind === 'emoji') {
					// Emoji ainda não carregado (paginação lazy): mantém o
					// shortcode literal, como o componente original.
					const url = urlFn(t.emoji);
					if (url) {
						return `<img
							class="${hasText ? 'inline-emoji' : 'full-emoji'}"
							src="${url}"
							alt="${t.name}"
							aria-hidden="true" />`;
					}
					return `:${t.name}:`;
				}
				let value = escapeText(t.value);
				for (const [key, html] of placeholders) value = value.replaceAll(key, html);
				return value;
			})
			.join('');
	};
	return r;
}

export function renderMessageMarkdown(
	content: string,
	nameMap: EmojiNameMap,
	urlFn: (emoji: Emoji) => string = emojiUrl,
	options: MessageMarkdownOptions = {}
): string {
	if (!content) {
		return '';
	}
	const normalizedContent = normalizeFencedCodeBlocks(content);
	const contentWithBlankLines = preserveBlankLines(normalizedContent);
	// hasText is calculated on the normalized content so fenced code follows
	// the same parsing path regardless of how tightly the user typed the fence.
	const hasText = tokenize(normalizedContent, nameMap).hasText;
	return marked.parse(contentWithBlankLines, {
		async: false,
		gfm: true,
		breaks: true,
		renderer: makeRenderer(nameMap, hasText, urlFn, options)
	});
}
