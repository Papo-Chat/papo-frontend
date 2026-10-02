// Vitest on the message markdown renderer (pure logic, no DOM):
// CommonMark + GFM, friendly line breaks, raw HTML stripped, custom emoji
// shortcodes, escaping.

import { describe, expect, it } from 'vitest';
import { renderMessageMarkdown } from '../src/lib/utils/markdown';
import type { Emoji } from '../src/lib/types';

const x: Emoji = {
	id: 'x',
	name: 'x',
	image_blob: 'x',
	format: 'PNG',
	created_by: null,
	created_at: ''
};
const nameMap = new Map<string, Emoji>([['x', x]]);
const urlFn = (e: Emoji) => `/e/${e.name}`;

describe('renderMessageMarkdown', () => {
	it('returns empty for empty content', () => {
		expect(renderMessageMarkdown('', nameMap, urlFn)).toBe('');
	});

	it('renders plain text as a paragraph', () => {
		expect(renderMessageMarkdown('hello', nameMap, urlFn)).toBe('<p>hello</p>\n');
	});

	it('strips raw HTML blocks/inline tags and escapes text', () => {
		// Raw script block: discarded entirely.
		expect(renderMessageMarkdown('<script>alert(1)</script>', nameMap, urlFn)).toBe('');
		// Inline tags: stripped, text kept; plain < and & escaped.
		const out = renderMessageMarkdown('a <b>bold</b> & c <d>e</d>', nameMap, urlFn);
		expect(out).not.toContain('<b>');
		expect(out).not.toContain('<d>');
		expect(out).toContain('a bold');
		expect(out).toContain('&amp;');
		expect(out).toContain('e');
	});

	it('renders bold, italic and strikethrough (GFM)', () => {
		const out = renderMessageMarkdown('**b** *i* ~~s~~', nameMap, urlFn);
		expect(out).toContain('<strong>b</strong>');
		expect(out).toContain('<em>i</em>');
		expect(out).toContain('<del>s</del>');
	});

	it('turns single newlines into <br> (breaks)', () => {
		expect(renderMessageMarkdown('a\nb', nameMap, urlFn)).toContain('<br>');
	});

	it('preserves blank lines between paragraphs', () => {
		const out = renderMessageMarkdown('a\n\nb', nameMap, urlFn);
		expect((out.match(/message-blank-line/g) ?? []).length).toBe(1);
		expect(out).toContain('<p>a</p>');
		expect(out).toContain('<p>b</p>');
	});

	it('preserves consecutive blank lines without collapsing them', () => {
		const out = renderMessageMarkdown('a\n\n\nb', nameMap, urlFn);
		expect((out.match(/message-blank-line/g) ?? []).length).toBe(2);
	});

	it('does not inject blank-line markers inside fenced code blocks', () => {
		const out = renderMessageMarkdown('```\na\n\nb\n```', nameMap, urlFn);
		expect(out).toContain('a\n\nb');
		expect(out).not.toContain('message-blank-line');
	});

	it('renders fenced code blocks, escaping their content', () => {
		const out = renderMessageMarkdown('```\nfoo <bar>\n```', nameMap, urlFn);
		expect(out).toContain('<pre><code>');
		expect(out).toContain('foo &lt;bar&gt;');
	});

	it('treats triple backticks as a block even when attached to content', () => {
		const oneLine = renderMessageMarkdown('```{"ok":true}```', nameMap, urlFn);
		expect(oneLine).toContain('<pre><code>');
		expect(oneLine).toContain('{&quot;ok&quot;:true}');
		expect(oneLine).not.toContain('<p><code>');

		const attachedClose = renderMessageMarkdown('```\nfirst\nsecond```', nameMap, urlFn);
		expect(attachedClose).toContain('<pre><code>first\nsecond\n</code></pre>');
	});

	it('keeps single backticks as inline code', () => {
		const out = renderMessageMarkdown('before `inline` after', nameMap, urlFn);
		expect(out).toContain('<p>before <code>inline</code> after</p>');
		expect(out).not.toContain('<pre>');
	});

	it('keeps emoji shortcodes literal inside code spans', () => {
		const out = renderMessageMarkdown('`x :y:`', nameMap, urlFn);
		expect(out).toContain('<code>');
		expect(out).toContain(':y:');
		expect(out).not.toContain('src="/e/y"');
	});

	it('resolves known emoji shortcodes to inline images when text is present', () => {
		const out = renderMessageMarkdown(':x: hi', nameMap, urlFn);
		expect(out).toContain('<img');
		expect(out).toContain('src="/e/x"');
		expect(out).toContain('inline-emoji');
	});

	it('renders a lone emoji at full size (no text in content)', () => {
		const out = renderMessageMarkdown(':x:', nameMap, urlFn);
		expect(out).toContain('full-emoji');
	});

	it('keeps unknown shortcodes as literal text', () => {
		const out = renderMessageMarkdown(':q: ok', nameMap, urlFn);
		expect(out).toContain(':q:');
		expect(out).not.toContain('<img');
	});

	it('renders headings, lists, blockquote, hr and tables', () => {
		const out = renderMessageMarkdown(
			'# T\n- a\n- b\n\n> q\n\n***\n\n| c | d |\n|--|--|\n| 1 | 2 |',
			nameMap,
			urlFn
		);
		expect(out).toContain('<h1>T</h1>');
		expect(out).toContain('<ul>');
		expect(out).toContain('<li>a</li>');
		expect(out).toContain('<li>b</li>');
		expect(out).toContain('<blockquote>');
		expect(out).toContain('<hr>');
		expect(out).toContain('<table>');
		expect(out).toContain('<th>c</th>');
		expect(out).toContain('<td>1</td>');
	});

	it('renders links and autolinks', () => {
		const out = renderMessageMarkdown('[t](https://e.com/x) https://e.com/y', nameMap, urlFn);
		expect(out).toContain('<a href="https://e.com/x">t</a>');
		expect(out).toContain('<a href="https://e.com/y">https://e.com/y</a>');
	});

	it('blocks unsafe link schemes (javascript:/vbscript:/data:) and renders plain text', () => {
		const out = renderMessageMarkdown(
			'[x](javascript:alert(1)) [y](vbscript:msg) [z](data:text/html,<script>1</script>) https://e.com ok',
			nameMap,
			urlFn
		);
		expect(out).not.toContain('href="javascript');
		expect(out).not.toContain('href="vbscript');
		expect(out).not.toContain('href="data');
		expect(out).toContain('<a href="https://e.com"');
		// Blocked link text is kept (as text), just without the anchor.
		expect(out).toContain('x');
	});

	it('renders emoji inside inline formatting and tables', () => {
		const out = renderMessageMarkdown(
			'**bold :x: text**\n\n| col |\n|--|\n| :x: |',
			nameMap,
			urlFn
		);
		expect(out).toContain('<strong>');
		expect(out).toContain('<table>');
		// The emoji cell must be an image, not the literal shortcode.
		const cells = out.match(/<td>([\s\S]*?)<\/td>/g) ?? [];
		expect(cells.some((c) => c.includes('src="/e/x"'))).toBe(true);
	});

	it('decodes numeric character references in text (marked behavior)', () => {
		expect(renderMessageMarkdown('&#65;', nameMap, urlFn)).toContain('<p>A</p>');
	});

	it('escapes backslash-escaped markdown', () => {
		expect(renderMessageMarkdown('\\*not bold\\*', nameMap, urlFn)).toContain('<p>');
		expect(renderMessageMarkdown('\\*not bold\\*', nameMap, urlFn)).not.toContain('<strong>');
	});
});
