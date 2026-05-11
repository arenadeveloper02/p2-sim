/** Unipile `linkedin_sections` query values for `GET /api/v1/users/{identifier}` (LinkedIn). */
export const UNIPILE_LINKEDIN_PROFILE_SECTIONS = [
  '*',
  '*_preview',
  'about',
  'experience',
  'education',
  'languages',
  'skills',
  'certifications',
  'volunteering_experience',
  'projects',
  'recommendations_received',
  'recommendations_given',
  'recruiting_activity',
  'experience_preview',
  'education_preview',
  'languages_preview',
  'skills_preview',
  'certifications_preview',
  'volunteering_experience_preview',
  'projects_preview',
  'recommendations_received_preview',
  'recommendations_given_preview',
] as const

export type UnipileLinkedinProfileSection = (typeof UNIPILE_LINKEDIN_PROFILE_SECTIONS)[number]

/** Human-readable labels for block UI (combobox + collapsed row headers). */
const LINKEDIN_PROFILE_SECTION_LABELS: Record<UnipileLinkedinProfileSection, string> = {
  '*': 'All sections (full data)',
  '*_preview': 'All sections (preview only)',
  about: 'About',
  experience: 'Experience (full)',
  education: 'Education (full)',
  languages: 'Languages (full)',
  skills: 'Skills (full)',
  certifications: 'Certifications (full)',
  volunteering_experience: 'Volunteering (full)',
  projects: 'Projects (full)',
  recommendations_received: 'Recommendations received (full)',
  recommendations_given: 'Recommendations given (full)',
  recruiting_activity: 'Recruiting activity',
  experience_preview: 'Experience (preview)',
  education_preview: 'Education (preview)',
  languages_preview: 'Languages (preview)',
  skills_preview: 'Skills (preview)',
  certifications_preview: 'Certifications (preview)',
  volunteering_experience_preview: 'Volunteering (preview)',
  projects_preview: 'Projects (preview)',
  recommendations_received_preview: 'Recommendations received (preview)',
  recommendations_given_preview: 'Recommendations given (preview)',
}

export function getLinkedinProfileSectionLabel(section: string): string {
  if (section in LINKEDIN_PROFILE_SECTION_LABELS) {
    return LINKEDIN_PROFILE_SECTION_LABELS[section as UnipileLinkedinProfileSection]
  }
  return section.replace(/_/g, ' ')
}

/** Combobox options for Retrieve a profile → LinkedIn sections (value = API enum). */
export function getLinkedinProfileSectionComboboxOptions(): {
  label: string
  value: string
}[] {
  return UNIPILE_LINKEDIN_PROFILE_SECTIONS.map((id) => ({
    label: LINKEDIN_PROFILE_SECTION_LABELS[id],
    value: id,
  }))
}

export const UNIPILE_LINKEDIN_PROFILE_API = ['recruiter', 'sales_navigator'] as const

export type UnipileLinkedinProfileApi = (typeof UNIPILE_LINKEDIN_PROFILE_API)[number]
