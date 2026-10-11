/** A tiny synthetic page in the shape of Apple's DocC JSON, for citation tests. Not Apple content. */
import type { HIGDoc } from '../../src/hig/doc.js';

const t = (text: string) => ({ type: 'text', text });
const p = (...inline: object[]) => ({ type: 'paragraph', inlineContent: inline });

export function syntheticPage(): HIGDoc {
  return {
    metadata: { title: 'Widgets' },
    primaryContentSections: [
      {
        content: [
          p(t('Widgets are small. They live on the shelf.')),
          { type: 'heading', level: 2, text: 'Best practices', anchor: 'Best-practices' },
          p(
            { type: 'strong', inlineContent: [t('Keep widgets tidy.')] },
            t(' A widget that’s tidy is easy to scan — even at a glance. Use the '),
            { type: 'codeVoice', code: 'tidy()' },
            t(' helper, see '),
            { type: 'reference', identifier: 'doc://x/shelves', isActive: true },
            t('. In iOS, widgets stack.')
          ),
          { type: 'unorderedList', items: [{ content: [p(t('Prefer round corners.'))] }] },
          { type: 'heading', level: 2, text: 'Platform considerations', anchor: 'Platform-considerations' },
          { type: 'heading', level: 3, text: 'watchOS', anchor: 'watchOS' },
          { type: 'aside', name: 'Note', content: [p(t('Avoid more than two widgets on a watch.'))] },
          {
            type: 'table',
            header: 'row',
            rows: [
              [[p(t('Platform'))], [p(t('Size'))]],
              [[p(t('watchOS'))], [p(t('20x20 pt'))]],
            ],
          },
          {
            type: 'tabNavigator',
            tabs: [{ title: 'Tab', content: [p(t('Tabs hide sentences too.'))] }],
          },
        ],
      },
    ],
    references: { 'doc://x/shelves': { title: 'Shelves', url: '/design/human-interface-guidelines/shelves' } },
  };
}
