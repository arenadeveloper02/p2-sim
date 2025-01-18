import { ToolConfig } from '../types';

interface ContactParams {
  apiKey: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  id?: string;
  properties?: Record<string, string>;
  limit?: number;
  after?: string;
}

interface ContactResponse {
  id: string;
  properties: {
    email: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

export const contactsTool: ToolConfig<ContactParams, ContactResponse | ContactResponse[]> = {
  id: 'hubspot.contacts',
  name: 'HubSpot Contacts',
  description: 'Manage HubSpot contacts - create, search, and update contact records',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'HubSpot API key'
    },
    email: {
      type: 'string',
      required: true,
      description: 'Contact email address'
    },
    firstName: {
      type: 'string',
      description: 'Contact first name'
    },
    lastName: {
      type: 'string',
      description: 'Contact last name'
    },
    phone: {
      type: 'string',
      description: 'Contact phone number'
    },
    company: {
      type: 'string',
      description: 'Contact company name'
    },
    id: {
      type: 'string',
      description: 'Contact ID (required for updates)'
    },
    properties: {
      type: 'object',
      description: 'Additional contact properties'
    },
    limit: {
      type: 'number',
      default: 100,
      description: 'Number of records to return'
    },
    after: {
      type: 'string',
      description: 'Pagination cursor'
    }
  },

  request: {
    url: (params) => {
      const baseUrl = 'https://api.hubapi.com/crm/v3/objects/contacts';
      if (params.id) {
        return `${baseUrl}/${params.id}`;
      }
      return baseUrl;
    },
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params) => {
      const properties = {
        email: params.email,
        ...(params.firstName && { firstname: params.firstName }),
        ...(params.lastName && { lastname: params.lastName }),
        ...(params.phone && { phone: params.phone }),
        ...(params.company && { company: params.company }),
        ...params.properties
      };

      if (params.id) {
        // Update existing contact
        return { properties };
      }

      // Create new contact or search
      return {
        properties,
        ...(params.limit && { limit: params.limit }),
        ...(params.after && { after: params.after })
      };
    }
  },

  transformResponse: (data) => {
    if (Array.isArray(data.results)) {
      // Search response
      return data.results.map((contact: { id: string; properties: Record<string, any>; createdAt: string; updatedAt: string }) => ({
        id: contact.id,
        properties: contact.properties,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt
      }));
    }
    // Single contact response
    return {
      id: data.id,
      properties: data.properties,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  },

  transformError: (error) => {
    const message = error.message || error.error?.message;
    const code = error.status || error.error?.status;
    return `${message} (${code})`;
  }
}; 