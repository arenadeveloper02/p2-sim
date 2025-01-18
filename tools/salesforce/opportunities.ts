import { ToolConfig } from '../types';

interface OpportunityParams {
  instanceUrl: string;
  accessToken: string;
  name: string;
  accountId?: string;
  stage?: string;
  amount?: number;
  closeDate?: string;
  probability?: number;
  description?: string;
  id?: string;
  properties?: Record<string, any>;
  query?: string;
  limit?: number;
}

interface OpportunityResponse {
  id: string;
  name: string;
  accountId?: string;
  stage?: string;
  amount?: number;
  closeDate?: string;
  probability?: number;
  description?: string;
  createdDate: string;
  lastModifiedDate: string;
  [key: string]: any;
}

export const opportunitiesTool: ToolConfig<OpportunityParams, OpportunityResponse | OpportunityResponse[]> = {
  id: 'salesforce.opportunities',
  name: 'Salesforce Opportunities',
  description: 'Manage Salesforce opportunities - create, query, and update opportunity records',
  version: '1.0.0',

  params: {
    instanceUrl: {
      type: 'string',
      required: true,
      description: 'Salesforce instance URL'
    },
    accessToken: {
      type: 'string',
      required: true,
      description: 'Salesforce access token'
    },
    name: {
      type: 'string',
      required: true,
      description: 'Opportunity name'
    },
    accountId: {
      type: 'string',
      description: 'Associated account ID'
    },
    stage: {
      type: 'string',
      description: 'Opportunity stage'
    },
    amount: {
      type: 'number',
      description: 'Opportunity amount'
    },
    closeDate: {
      type: 'string',
      description: 'Expected close date (YYYY-MM-DD)'
    },
    probability: {
      type: 'number',
      description: 'Probability of closing (%)'
    },
    description: {
      type: 'string',
      description: 'Opportunity description'
    },
    id: {
      type: 'string',
      description: 'Opportunity ID (required for updates)'
    },
    properties: {
      type: 'object',
      description: 'Additional opportunity fields'
    },
    query: {
      type: 'string',
      description: 'SOQL query for searching opportunities'
    },
    limit: {
      type: 'number',
      default: 100,
      description: 'Maximum number of records to return'
    }
  },

  request: {
    url: (params) => {
      const baseUrl = `${params.instanceUrl}/services/data/v58.0/sobjects/Opportunity`;
      if (params.query) {
        return `${params.instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(params.query)}`;
      }
      if (params.id) {
        return `${baseUrl}/${params.id}`;
      }
      return baseUrl;
    },
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.accessToken}`
    }),
    body: (params) => {
      if (params.query) {
        return {}; // Empty body for queries
      }

      const fields = {
        Name: params.name,
        ...(params.accountId && { AccountId: params.accountId }),
        ...(params.stage && { StageName: params.stage }),
        ...(params.amount && { Amount: params.amount }),
        ...(params.closeDate && { CloseDate: params.closeDate }),
        ...(params.probability && { Probability: params.probability }),
        ...(params.description && { Description: params.description }),
        ...params.properties
      };

      return fields;
    }
  },

  transformResponse: (data) => {
    if (data.records) {
      // Query response
      return data.records.map((record: any) => ({
        id: record.Id,
        name: record.Name,
        accountId: record.AccountId,
        stage: record.StageName,
        amount: record.Amount,
        closeDate: record.CloseDate,
        probability: record.Probability,
        description: record.Description,
        createdDate: record.CreatedDate,
        lastModifiedDate: record.LastModifiedDate,
        ...record
      }));
    }
    // Single record response
    return {
      id: data.id || data.Id,
      name: data.name || data.Name,
      accountId: data.accountId || data.AccountId,
      stage: data.stage || data.StageName,
      amount: data.amount || data.Amount,
      closeDate: data.closeDate || data.CloseDate,
      probability: data.probability || data.Probability,
      description: data.description || data.Description,
      createdDate: data.CreatedDate,
      lastModifiedDate: data.LastModifiedDate,
      ...data
    };
  },

  transformError: (error) => {
    const message = error.message || error.error?.message;
    const code = error.errorCode || error.error?.errorCode;
    return `${message} (${code})`;
  }
}; 