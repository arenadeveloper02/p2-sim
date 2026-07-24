import { defineCatalog } from '@json-render/core'
import { schema as reactSchema } from '@json-render/react/schema'
import { schema as emailSchema } from '@json-render/react-email/server'
import { standardComponentDefinitions } from '@json-render/react-email/catalog'
import { z } from 'zod'

/**
 * Email catalog — React Email standard components via json-render.
 */
export const emailCatalog = defineCatalog(emailSchema, {
  components: {
    Html: standardComponentDefinitions.Html,
    Head: standardComponentDefinitions.Head,
    Body: standardComponentDefinitions.Body,
    Container: standardComponentDefinitions.Container,
    Section: standardComponentDefinitions.Section,
    Row: standardComponentDefinitions.Row,
    Column: standardComponentDefinitions.Column,
    Heading: standardComponentDefinitions.Heading,
    Text: standardComponentDefinitions.Text,
    Link: standardComponentDefinitions.Link,
    Button: standardComponentDefinitions.Button,
    Image: standardComponentDefinitions.Image,
    Hr: standardComponentDefinitions.Hr,
    Preview: standardComponentDefinitions.Preview,
  },
})

/**
 * Webpage catalog — compact layout primitives with inline-style-friendly props.
 * Kept small so the model stays within a reliable vocabulary.
 */
export const webpageCatalog = defineCatalog(reactSchema, {
  components: {
    Page: {
      props: z.object({
        title: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Root page wrapper. Always use as the root element for webpage mode.',
    },
    Section: {
      props: z.object({
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        maxWidth: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Content section with optional padding and background',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).nullable(),
        gap: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
      }),
      slots: ['default'],
      description: 'Flex stack for vertical or horizontal layout',
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Card container with optional title',
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3', 'h4']).nullable(),
        color: z.string().nullable(),
      }),
      description: 'Heading text',
    },
    Text: {
      props: z.object({
        text: z.string(),
        color: z.string().nullable(),
        size: z.string().nullable(),
      }),
      description: 'Paragraph text',
    },
    Button: {
      props: z.object({
        label: z.string(),
        href: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        color: z.string().nullable(),
      }),
      description: 'Button or link-styled button',
    },
    Link: {
      props: z.object({
        label: z.string(),
        href: z.string(),
        color: z.string().nullable(),
      }),
      description: 'Hyperlink',
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().nullable(),
        width: z.string().nullable(),
        height: z.string().nullable(),
      }),
      description: 'Image element',
    },
    Divider: {
      props: z.object({
        color: z.string().nullable(),
      }),
      description: 'Horizontal rule',
    },
    List: {
      props: z.object({
        ordered: z.boolean().nullable(),
      }),
      slots: ['default'],
      description: 'List container; children should be ListItem',
    },
    ListItem: {
      props: z.object({
        text: z.string(),
      }),
      description: 'List item text',
    },
  },
  actions: {},
})

export const GENERATIVE_UI_OUTPUT_RULES = [
  'Output a single complete JSON object with shape { "root": string, "elements": { [key: string]: Element } }.',
  'Do NOT output JSONL patches. Do NOT wrap the JSON in markdown code fences.',
  'Every element must have type, props, and children (use [] when there are no children).',
  'Only use component types from the catalog. Prefer clear hierarchy and readable copy.',
] as const
