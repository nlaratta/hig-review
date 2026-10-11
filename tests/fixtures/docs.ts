/** Tiny hand-written documents in the shape of Apple's DocC JSON. Not Apple content. */
import type { HIGDoc } from '../src/hig/doc.js';

const id = (slug: string) => `doc://com.apple.HIG/design/Human-Interface-Guidelines/${slug}`;
const text = (t: string) => [{ type: 'text', text: t }];

export const rootDoc: HIGDoc = {
  topicSections: [{ anchor: 'Topics', identifiers: [id('foundations'), id('components')] }],
  references: {
    [id('foundations')]: { title: 'Foundations', abstract: text('Basics of the sample system.'), role: 'collectionGroup', url: '/design/human-interface-guidelines/foundations' },
    [id('components')]: { title: 'Components', abstract: [], role: 'collectionGroup', url: '/design/human-interface-guidelines/components' },
  },
};

export const foundationsDoc: HIGDoc = {
  topicSections: [{ identifiers: [id('color'), id('color#Dark-colors')] }],
  references: {
    [id('color')]: { title: 'Color', abstract: text('Use color with care.'), role: 'article', url: '/design/human-interface-guidelines/color' },
    [id('color#Dark-colors')]: { title: 'Dark colors', abstract: [], role: 'article', url: '/design/human-interface-guidelines/color#Dark-colors' },
  },
};

export const componentsDoc: HIGDoc = {
  topicSections: [{ identifiers: [id('buttons'), id('menus')] }],
  references: {
    [id('buttons')]: { title: 'Buttons', abstract: text('A sample control starts a speedy task.'), role: 'article', url: '/design/human-interface-guidelines/buttons' },
    [id('menus')]: { title: 'Menus', abstract: text('A sample list of commands and actions.'), role: 'article', url: '/design/human-interface-guidelines/menus' },
  },
};

export const buttonsDoc: HIGDoc = {
  abstract: text('A sample control starts a speedy task.'),
  metadata: { title: 'Buttons', customMetadata: { 'supported-platforms': 'ios,macos' } },
  hierarchy: { paths: [['doc://com.apple.documentation/documentation/technologies', 'doc://com.apple.HIG/design/human-interface-guidelines', id('components')]] },
  primaryContentSections: [
    {
      content: [
        { type: 'paragraph', inlineContent: [{ type: 'text', text: 'Use ' }, { type: 'strong', inlineContent: text('clear') }, { type: 'text', text: ' labels, see ' }, { type: 'reference', identifier: id('menus'), isActive: true }, { type: 'text', text: '.' }] },
        { type: 'heading', level: 2, text: 'Best practices', anchor: 'Best-practices' },
        { type: 'unorderedList', items: [{ content: [{ type: 'paragraph', inlineContent: text('First') }] }, { content: [{ type: 'paragraph', inlineContent: text('Second') }] }] },
        { type: 'aside', style: 'note', name: 'Note', content: [{ type: 'paragraph', inlineContent: text('Mind the hit region.') }] },
        { type: 'table', header: 'row', rows: [[[{ type: 'paragraph', inlineContent: text('Size') }], [{ type: 'paragraph', inlineContent: text('Use') }]], [[{ type: 'paragraph', inlineContent: text('44pt') }], [{ type: 'paragraph', inlineContent: text('a|b') }]]] },
        { type: 'paragraph', inlineContent: [{ type: 'image', identifier: 'pic.png' }] },
      ],
    },
  ],
  references: {
    [id('menus')]: { title: 'Menus', url: '/design/human-interface-guidelines/menus' },
    'pic.png': { alt: 'A sample picture', type: 'image' },
  },
};
