import type { PresentationSchema } from './schema'

/** Template ids supported by getTemplateMasterSchema (for dropdown) */
export const TEMPLATE_OPTIONS = [
  { value: 'position2_2026', label: 'Position2 2026' },
] as const

export type TemplateId = (typeof TEMPLATE_OPTIONS)[number]['value']

/**
 * Returns the master schema for the given template id.
 * Template must match a known id (e.g. position2_2026); use TEMPLATE_OPTIONS for dropdown values.
 *
 * @param template - Template id from TEMPLATE_OPTIONS (e.g. 'position2_2026')
 * @returns Full presentation schema for that template
 */
export function getTemplateMasterSchema(template: string): PresentationSchema {
  if (template === 'position2_2026') {
    return buildTemplateSchema()
  }
  throw new Error(`Unknown template: ${template}. Supported: ${TEMPLATE_OPTIONS.map((t) => t.value).join(', ')}`)
}

/**
 * Runs once when template changes
 * Output is stored in DB / JSON file
 */
function buildTemplateSchema(): PresentationSchema {
  return {
    schemaVersion: '1.0',
    templateVersion: 'position2_2026',
    id: "1wYE4gy_iHhLzmI1ra4F5U3wf_DI_fPWIzA_uRzPFwpU",
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
        slideKey: 'COVER_SLIDE',
        order: 2,
        templateSlideObjectId: 'g392319e7c15_4_83',
        description: 'Cover slide with title, subtitle, date, and hero image',
        blocks: [
          {
            key: 'title',
            type: 'TEXT',
            role: 'TITLE',
            shapeId: 'g392319e7c15_4_85',
            minChars: 10,
            maxChars: 60,
            description: 'Main presentation headline',
            content: '',
          },
          {
            key: 'subtitle',
            type: 'TEXT',
            role: 'BODY',
            shapeId: 'g392319e7c15_4_87',
            minChars: 10,
            maxChars: 80,
            description: 'Presentation subtitle or tagline',
            content: '',
          },
          {
            key: 'date',
            type: 'TEXT',
            role: 'BODY',
            shapeId: 'g392319e7c15_4_86',
            minChars: 5,
            maxChars: 30,
            description: 'Month and year display (e.g., "February | 2026")',
            content: '',
          },
          // {
          //   key: 'hero_image',
          //   type: 'IMAGE',
          //   role: 'PRIMARY_VISUAL',
          //   usage: ['background', 'contextual_photo', 'hero'],
          //   shapeId: 'g392319e7c15_4_91',
          //   description: 'Large hero image on the right side of the slide',
          //   content: '',
          // },
          // {
          //   key: 'logo',
          //   type: 'IMAGE',
          //   role: 'SUPPORTING_VISUAL',
          //   usage: ['logo', 'branding'],
          //   shapeId: 'g392319e7c15_4_98',
          //   description: 'Company logo in top left corner',
          //   content: '',
          // },
        ],
      },
      {
        slideKey: 'TABLE_OF_CONTENTS',
        order: 3,
        description: 'Table of contents slide with numbered list of sections',
        templateSlideObjectId: 'g2380b89c92d_0_1',

        blocks: [
          {
            key: 'toc_items',
            type: 'TEXT',
            role: 'LIST',

            shapeId: 'g2380b89c92d_0_3', // BODY text box containing numbered list
            description: 'List of section titles shown in the table of contents',

            content: [],
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
      {
        slideKey: 'TWO_COLUMN_IMAGE_TEXT',
        order: 4,
        templateSlideObjectId: 'g3bd983d1368_1_0', // correct – matches the slide's objectId
        description: 'Two-column layout with images, headers, and bulleted text content',
        blocks: [
          {
            key: 'title',
            type: 'TEXT',
            role: 'TITLE',
            shapeId: 'g3bd983d1368_1_3', // correct – TITLE placeholder
            minChars: 15,
            maxChars: 60,
            description: 'Slide title describing the two-column content',
            content: '',
          },
          {
            key: 'left_image',
            type: 'IMAGE',
            role: 'PRIMARY_VISUAL',
            usage: ['contextual_photo', 'illustration'],
            shapeId: 'g3bd983d1368_1_5', // correct – left AdobeStock image
            description: 'Left column image',
            content: '',
          },
          {
            key: 'left_header',
            type: 'TEXT',
            role: 'SECTION_HEADER',
            shapeId: 'g3bd983d1368_1_11', // correct – left bold 18pt header
            minChars: 10,
            maxChars: 40,
            description: 'Left column header (bold, colored, 18pt)',
            content: '',
          },
          {
            key: 'left_content',
            type: 'TEXT',
            role: 'LIST',
            shapeId: 'g3bd983d1368_1_12', // correct – left bulleted list
            minItems: 2,
            maxItems: 4,
            itemConstraints: {
              minChars: 30,
              maxChars: 160,
              description: 'Body text for each bulleted point'
            },
            description: 'Left column bulleted list with body text only',
            content: [],
          },
          {
            key: 'right_image',
            type: 'IMAGE',
            role: 'PRIMARY_VISUAL',
            usage: ['contextual_photo', 'illustration'],
            shapeId: 'g3bd983d1368_1_7', // correct – right AdobeStock image
            description: 'Right column image',
            content: '',
          },
          {
            key: 'right_header',
            type: 'TEXT',
            role: 'SECTION_HEADER',
            shapeId: 'g3bd983d1368_1_13', // correct – right bold 18pt header
            minChars: 10,
            maxChars: 40,
            description: 'Right column header (bold, colored, 18pt)',
            content: '',
          },
          {
            key: 'right_content',
            type: 'TEXT',
            role: 'LIST',
            shapeId: 'g3bd983d1368_1_15', // ← FIXED: was wrong (1_14), now correct
            minItems: 2,
            maxItems: 4,
            itemConstraints: {
              minChars: 30,
              maxChars: 160,
              description: 'Body text for each bulleted point'
            },
            description: 'Right column bulleted list with body text only',
            content: [],
          },
        ],
      }
    ],
  }
}
