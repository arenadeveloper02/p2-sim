import type { PresentationSchema } from './schema'

/**
 * Runs once when template changes
 * Output is stored in DB / JSON file
 */
export function buildTemplateSchema(): PresentationSchema {
  return {
    schemaVersion: '1.0',
    templateVersion: 'position2_v1',
    slides: [
      {
        slideKey: 'TITLE_SLIDE',
        order: 1,
        templateSlideObjectId: 'g3b56832a139_1_23', // from presentations.get
        description: 'Opening title slide',
        blocks: [
          {
            key: 'headline',
            type: 'TEXT',
            role: 'TITLE',
            shapeId: 'g3b56832a139_1_25',
            minChars: 10,
            maxChars: 20,
            description: 'Main presentation headline',
            content: '',
          },
          {
            key: 'topic_visual',
            type: 'IMAGE',
            role: 'SUPPORTING_VISUAL',
            usage: ['logo', 'topic_icon'],
            shapeId: 'g3b56832a139_1_24',
            description: 'Small supporting visual, not a hero image',
            content: '',
          },
        ],
      },
      {
        slideKey: 'TABLE_OF_CONTENTS',
        order: 2,
        description: 'Table of contents slide with numbered list of sections',
        templateSlideObjectId: 'g2380b89c92d_0_1',

        blocks: [
          {
            key: 'toc_items',
            type: 'TEXT',
            role: 'LIST',

            shapeId: 'g2380b89c92d_0_3', // BODY text box containing numbered list
            description: 'List of section titles shown in the table of contents',

            content: '',

            minItems: 3,
            maxItems: 8,

            itemConstraints: {
              minChars: 10,
              maxChars: 40,
              description: 'Concise section heading',
            },
          },
        ],
      },
    ],
  }
}
