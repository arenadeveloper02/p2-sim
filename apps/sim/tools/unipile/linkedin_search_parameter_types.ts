/**
 * Valid `type` query values for GET /api/v1/linkedin/search/parameters (Unipile OpenAPI union).
 * @see https://developer.unipile.com/docs/linkedin-search
 */
export const UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPES = [
  'LOCATION',
  'PEOPLE',
  'CONNECTIONS',
  'COMPANY',
  'SCHOOL',
  'INDUSTRY',
  'SERVICE',
  'JOB_FUNCTION',
  'JOB_TITLE',
  'EMPLOYMENT_TYPE',
  'SKILL',
  'GROUPS',
  'SALES_INDUSTRY',
  'DEPARTMENT',
  'PERSONA',
  'ACCOUNT_LISTS',
  'LEAD_LISTS',
  'TECHNOLOGIES',
  'SAVED_ACCOUNTS',
  'SAVED_SEARCHES',
  'RECENT_SEARCHES',
  'REGION',
  'POSTAL_CODE',
  'HIRING_PROJECTS',
  'SAVED_FILTERS',
  'DEGREE',
] as const

export type UnipileLinkedinSearchParameterType =
  (typeof UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPES)[number]

export const UNIPILE_LINKEDIN_SEARCH_SERVICES = ['CLASSIC', 'RECRUITER', 'SALES_NAVIGATOR'] as const

export type UnipileLinkedinSearchService = (typeof UNIPILE_LINKEDIN_SEARCH_SERVICES)[number]

/** UI grouping for block dropdown (OpenAPI splits common / Sales Nav / Recruiter). */
export const UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPE_GROUP: Record<
  UnipileLinkedinSearchParameterType,
  string
> = {
  LOCATION: 'Common',
  PEOPLE: 'Common',
  CONNECTIONS: 'Common',
  COMPANY: 'Common',
  SCHOOL: 'Common',
  INDUSTRY: 'Common',
  SERVICE: 'Common',
  JOB_FUNCTION: 'Common',
  JOB_TITLE: 'Common',
  EMPLOYMENT_TYPE: 'Common',
  SKILL: 'Common',
  GROUPS: 'Sales Navigator & Recruiter',
  SALES_INDUSTRY: 'Sales Navigator',
  DEPARTMENT: 'Sales Navigator & Recruiter',
  PERSONA: 'Sales Navigator',
  ACCOUNT_LISTS: 'Sales Navigator',
  LEAD_LISTS: 'Sales Navigator',
  TECHNOLOGIES: 'Sales Navigator',
  SAVED_ACCOUNTS: 'Sales Navigator',
  SAVED_SEARCHES: 'Sales Navigator & Recruiter',
  RECENT_SEARCHES: 'Sales Navigator',
  REGION: 'Sales Navigator',
  POSTAL_CODE: 'Sales Navigator',
  HIRING_PROJECTS: 'Recruiter',
  SAVED_FILTERS: 'Recruiter',
  DEGREE: 'Recruiter',
}

export function getLinkedinSearchParameterTypeDropdownOptions(): {
  label: string
  id: string
  group: string
}[] {
  return UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPES.map((id) => ({
    id,
    label: id.replace(/_/g, ' '),
    group: UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPE_GROUP[id],
  }))
}
