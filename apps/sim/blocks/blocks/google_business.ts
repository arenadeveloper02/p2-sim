import { StoreIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { GOOGLE_BUSINESS_ACCOUNTS } from '@/app/api/google-business/constants'

export const GoogleBusinessBlock: BlockConfig = {
  type: 'google_business',
  name: 'Google Business Profile',
  description: 'Manage Google Business Profile posts, reviews, and location settings',
  longDescription:
    'The Google Business Profile block allows you to create and manage posts on your Google Business Profile, including standard posts, event posts, and promotional offers. Supports rich media, call-to-action buttons, and detailed event/offer information.',
  docsLink: 'https://docs.sim.ai/tools/google-business',
  category: 'tools',
  bgColor: '#34a853',
  icon: StoreIcon,
  subBlocks: [
    {
      id: 'location',
      title: 'Business Location',
      type: 'dropdown',
      layout: 'full',
      options: Object.entries(GOOGLE_BUSINESS_ACCOUNTS).flatMap(([accountKey, account]) =>
        Object.entries(account.locations).map(([locationKey, location]) => ({
          id: `${accountKey}_${locationKey}`,
          label: location.name,
        }))
      ),
      placeholder: 'Select business location...',
      required: true,
    },
    {
      id: 'topicType',
      title: 'Post Type',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Standard Post', id: 'STANDARD' },
        { label: 'Event Post', id: 'EVENT' },
        { label: 'Offer Post', id: 'OFFER' },
      ],
      placeholder: 'Select post type...',
      required: true,
    },
    {
      id: 'summary',
      title: 'Post Content',
      type: 'long-input',
      layout: 'full',
      placeholder:
        'Enter the main content of your post (up to 1500 characters). Describe what you want to share with your customers.',
      rows: 4,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Google Business Profile post writer. Help create engaging, professional posts for local businesses.

### POST TYPES
- **Standard**: Regular updates, announcements, news
- **Event**: Upcoming events with dates and times
- **Offer**: Promotions, discounts, special deals

### BEST PRACTICES
- Keep it concise and engaging (under 1500 characters)
- Include a clear call-to-action
- Mention specific details (dates, prices, locations)
- Use friendly, professional tone
- Highlight what makes your business unique

### EXAMPLES
**Standard Post:**
"We're excited to announce our new summer menu! Fresh, locally-sourced ingredients and bold new flavors. Visit us this week and try our signature dishes. Open daily 11am-9pm."

**Event Post:**
"Join us for our Grand Opening celebration this Saturday, June 15th from 2-6pm! Live music, free samples, and special discounts for the first 50 customers. We can't wait to see you!"

**Offer Post:**
"Summer Sale! Get 20% off all services this month. Use code SUMMER20 at checkout. Valid through June 30th. Book your appointment today!"

Generate an engaging post based on the user's request.`,
      },
    },
    {
      id: 'callToActionType',
      title: 'Call-to-Action Button (Optional)',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Book', id: 'BOOK' },
        { label: 'Order', id: 'ORDER' },
        { label: 'Shop', id: 'SHOP' },
        { label: 'Learn More', id: 'LEARN_MORE' },
        { label: 'Sign Up', id: 'SIGN_UP' },
        { label: 'Call', id: 'CALL' },
        { label: 'Get Offer', id: 'GET_OFFER' },
      ],
      placeholder: 'Select CTA button...',
      required: false,
    },
    {
      id: 'callToActionUrl',
      title: 'CTA URL (Optional)',
      type: 'short-input',
      layout: 'half',
      placeholder: 'https://yourwebsite.com/page',
      required: false,
    },
    {
      id: 'mediaUrls',
      title: 'Image/Video URLs (Optional)',
      type: 'short-input',
      layout: 'full',
      placeholder: 'https://example.com/image.jpg (comma-separated for multiple)',
      required: false,
    },
  ],
  tools: {
    access: ['google_business_create_post'],
    config: {
      tool: () => 'google_business_create_post',
      params: (params) => ({
        accountId: params.accountId,
        locationId: params.locationId,
        summary: params.summary,
        topicType: params.topicType,
        callToActionType: params.callToActionType,
        callToActionUrl: params.callToActionUrl,
        mediaUrls: params.mediaUrls ? params.mediaUrls.split(',').map((url: string) => url.trim()) : undefined,
        // Event and offer fields can be added later when we expand the UI
      }),
    },
  },
  inputs: {
    accountId: { type: 'string', description: 'Google Business Profile account ID' },
    locationId: { type: 'string', description: 'Location/store ID' },
    summary: { type: 'string', description: 'Post content' },
    topicType: { type: 'string', description: 'Post type (STANDARD, EVENT, or OFFER)' },
    callToActionType: { type: 'string', description: 'CTA button type' },
    callToActionUrl: { type: 'string', description: 'CTA landing page URL' },
    mediaUrls: { type: 'string', description: 'Comma-separated image/video URLs' },
  },
  outputs: {
    postId: { type: 'string', description: 'ID of the created post' },
    success: { type: 'boolean', description: 'Whether the post was created successfully' },
  },
}
