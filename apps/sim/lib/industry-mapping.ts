/**
 * Industry Mapping for Google Ads Clients
 * Maps each client account to their industry vertical and demographic data
 */

export interface IndustryData {
  industry: string
  category: string
  demographics: {
    targetAgeGroups: string[]
    targetIncome: string
    primeLocations: string[]
    genderSplit: string
  }
  searchTerms: string[]
}

export const INDUSTRY_MAPPING: Record<string, IndustryData> = {
  // Medical Aesthetics & Plastic Surgery
  inspire_aesthetics: {
    industry: 'medical aesthetics',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$75k+',
      primeLocations: [
        'Beverly Hills, CA',
        'Scottsdale, AZ',
        'Miami, FL',
        'Manhattan, NY',
        'Dallas, TX',
      ],
      genderSplit: '70% Female, 30% Male',
    },
    searchTerms: [
      'medical aesthetics PPC benchmarks 2025',
      'aesthetic medicine Google Ads conversion rates',
      'botox advertising cost per click',
      'medical spa marketing ROI statistics',
    ],
  },
  mosca_plastic_surgery: {
    industry: 'plastic surgery',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$100k+',
      primeLocations: [
        'Beverly Hills, CA',
        'Manhattan, NY',
        'Miami, FL',
        'Houston, TX',
        'Chicago, IL',
      ],
      genderSplit: '75% Female, 25% Male',
    },
    searchTerms: [
      'plastic surgery advertising benchmarks 2025',
      'cosmetic surgery PPC conversion rates',
      'plastic surgery marketing cost per lead',
      'aesthetic surgery Google Ads performance',
    ],
  },
  marietta_plastic_surgery: {
    industry: 'plastic surgery',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$100k+',
      primeLocations: ['Atlanta, GA', 'Marietta, GA', 'Alpharetta, GA', 'Buckhead, GA'],
      genderSplit: '75% Female, 25% Male',
    },
    searchTerms: [
      'plastic surgery advertising benchmarks 2025',
      'cosmetic surgery PPC conversion rates',
      'plastic surgery marketing cost per lead',
    ],
  },
  daniel_shapiro: {
    industry: 'plastic surgery',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$100k+',
      primeLocations: ['Scottsdale, AZ', 'Phoenix, AZ', 'Paradise Valley, AZ'],
      genderSplit: '75% Female, 25% Male',
    },
    searchTerms: [
      'plastic surgery advertising benchmarks 2025',
      'cosmetic surgery PPC conversion rates',
    ],
  },
  southern_coastal: {
    industry: 'plastic surgery',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$100k+',
      primeLocations: ['Charleston, SC', 'Myrtle Beach, SC', 'Hilton Head, SC'],
      genderSplit: '75% Female, 25% Male',
    },
    searchTerms: [
      'plastic surgery advertising benchmarks 2025',
      'cosmetic surgery PPC conversion rates',
    ],
  },
  plastic_surgery_center_hr: {
    industry: 'plastic surgery',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$100k+',
      primeLocations: ['Virginia Beach, VA', 'Norfolk, VA', 'Chesapeake, VA'],
      genderSplit: '75% Female, 25% Male',
    },
    searchTerms: [
      'plastic surgery advertising benchmarks 2025',
      'cosmetic surgery PPC conversion rates',
    ],
  },
  epstein: {
    industry: 'medical devices',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64'],
      targetIncome: '$150k+',
      primeLocations: ['Major metro areas', 'Hospital districts'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: [
      'medical device marketing benchmarks 2025',
      'healthcare B2B advertising cost per lead',
      'medical equipment PPC conversion rates',
    ],
  },

  // Dental Services
  gentle_dental: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Family neighborhoods', 'Urban centers'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'dental practice PPC benchmarks 2025',
      'dentist advertising cost per click',
      'dental marketing conversion rates',
      'dental services Google Ads performance',
    ],
  },
  great_hill_dental: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Family neighborhoods'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: ['dental practice PPC benchmarks 2025', 'dentist advertising cost per click'],
  },
  dynamic_dental: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Family neighborhoods'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: ['dental practice PPC benchmarks 2025', 'dentist advertising cost per click'],
  },
  great_lakes: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Great Lakes region', 'Midwest suburbs'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: ['dental practice PPC benchmarks 2025', 'dentist advertising cost per click'],
  },
  southern_ct_dental: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$60k+',
      primeLocations: ['Southern Connecticut', 'Fairfield County', 'New Haven'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: ['dental practice PPC benchmarks 2025', 'dentist advertising cost per click'],
  },
  dental_care_associates: {
    industry: 'dental services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Family neighborhoods'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: ['dental practice PPC benchmarks 2025', 'dentist advertising cost per click'],
  },

  // Home Healthcare & Rehabilitation
  ami: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Retirement communities', 'Urban centers'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: [
      'home healthcare marketing benchmarks 2025',
      'home health services PPC cost per lead',
      'senior care advertising conversion rates',
    ],
  },
  heartland: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Midwest', 'Rural areas', 'Small cities'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },
  nhi: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },
  nova_hhc: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$50k+',
      primeLocations: ['Northern Virginia', 'Washington DC metro', 'Maryland suburbs'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },
  careadvantage: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },
  capitalcitynurses: {
    industry: 'home healthcare nursing',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['State capitals', 'Urban centers'],
      genderSplit: '70% Female, 30% Male',
    },
    searchTerms: ['nursing services marketing benchmarks 2025', 'home nursing PPC cost per lead'],
  },
  silverlininghealthcare: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },
  youngshc: {
    industry: 'home healthcare',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['55-64', '65-74', '75+'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '65% Female, 35% Male',
    },
    searchTerms: ['home healthcare marketing benchmarks 2025', 'home health services PPC cost'],
  },

  // Rehabilitation Services
  oic_culpeper: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Culpeper, VA', 'Northern Virginia', 'Rural Virginia'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  odc_al: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Alabama', 'Birmingham', 'Montgomery'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  cpic: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  idi_fl: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Florida', 'Miami', 'Orlando', 'Tampa'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  smi: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  holmdel_nj: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$60k+',
      primeLocations: ['Holmdel, NJ', 'Monmouth County', 'Central New Jersey'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  ft_jesse: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  ud: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  wolf_river: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Wisconsin', 'Midwest'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },
  phoenix_rehab: {
    industry: 'rehabilitation services',
    category: 'healthcare',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64', '65-74'],
      targetIncome: '$45k+',
      primeLocations: ['Phoenix, AZ', 'Scottsdale, AZ', 'Mesa, AZ'],
      genderSplit: '55% Female, 45% Male',
    },
    searchTerms: [
      'rehabilitation center marketing benchmarks 2025',
      'rehab services PPC cost per lead',
    ],
  },

  // Automotive
  monster_transmission: {
    industry: 'automotive repair',
    category: 'automotive',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54', '55-64'],
      targetIncome: '$40k+',
      primeLocations: ['Suburban areas', 'Urban centers', 'Highway corridors'],
      genderSplit: '60% Male, 40% Female',
    },
    searchTerms: [
      'automotive repair PPC benchmarks 2025',
      'auto service advertising cost per click',
      'transmission repair marketing conversion rates',
    ],
  },

  // HVAC Services
  service_air_eastern_shore: {
    industry: 'HVAC services',
    category: 'home services',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Eastern Shore, MD', 'Coastal Maryland', 'Delaware'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: [
      'HVAC services PPC benchmarks 2025',
      'air conditioning repair advertising cost per lead',
      'HVAC marketing conversion rates',
    ],
  },
  chancey_reynolds: {
    industry: 'HVAC services',
    category: 'home services',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: ['HVAC services PPC benchmarks 2025', 'HVAC marketing conversion rates'],
  },
  howell_chase: {
    industry: 'HVAC services',
    category: 'home services',
    demographics: {
      targetAgeGroups: ['35-44', '45-54', '55-64'],
      targetIncome: '$50k+',
      primeLocations: ['Suburban areas', 'Urban centers'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: ['HVAC services PPC benchmarks 2025', 'HVAC marketing conversion rates'],
  },

  // E-commerce
  au_eventgroove_products: {
    industry: 'event supplies ecommerce',
    category: 'ecommerce',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54'],
      targetIncome: '$40k+',
      primeLocations: ['Australia - Major cities', 'Sydney', 'Melbourne', 'Brisbane'],
      genderSplit: '60% Female, 40% Male',
    },
    searchTerms: [
      'ecommerce PPC benchmarks 2025',
      'event supplies advertising cost per click',
      'party supplies marketing conversion rates',
    ],
  },
  us_eventgroove_products: {
    industry: 'event supplies ecommerce',
    category: 'ecommerce',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54'],
      targetIncome: '$40k+',
      primeLocations: ['United States - Major metros', 'Nationwide'],
      genderSplit: '60% Female, 40% Male',
    },
    searchTerms: ['ecommerce PPC benchmarks 2025', 'event supplies advertising cost per click'],
  },
  ca_eventgroove_products: {
    industry: 'event supplies ecommerce',
    category: 'ecommerce',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54'],
      targetIncome: '$40k+',
      primeLocations: ['Canada - Major cities', 'Toronto', 'Vancouver', 'Montreal'],
      genderSplit: '60% Female, 40% Male',
    },
    searchTerms: ['ecommerce PPC benchmarks 2025', 'event supplies advertising cost per click'],
  },
  uk_eventgroove_products: {
    industry: 'event supplies ecommerce',
    category: 'ecommerce',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54'],
      targetIncome: '$40k+',
      primeLocations: ['United Kingdom - Major cities', 'London', 'Manchester', 'Birmingham'],
      genderSplit: '60% Female, 40% Male',
    },
    searchTerms: ['ecommerce PPC benchmarks 2025', 'event supplies advertising cost per click'],
  },
  perforated_paper: {
    industry: 'office supplies ecommerce',
    category: 'ecommerce',
    demographics: {
      targetAgeGroups: ['25-34', '35-44', '45-54'],
      targetIncome: '$40k+',
      primeLocations: ['Nationwide', 'Business districts'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: [
      'office supplies ecommerce PPC benchmarks 2025',
      'B2B ecommerce advertising cost per click',
    ],
  },

  // Scientific Equipment
  covalent_metrology: {
    industry: 'scientific equipment',
    category: 'B2B',
    demographics: {
      targetAgeGroups: ['30-44', '45-54', '55-64'],
      targetIncome: '$80k+',
      primeLocations: ['Research hubs', 'University towns', 'Tech corridors'],
      genderSplit: '50% Female, 50% Male',
    },
    searchTerms: [
      'B2B scientific equipment marketing benchmarks 2025',
      'laboratory equipment PPC cost per lead',
      'scientific instruments advertising conversion rates',
    ],
  },
}

/**
 * Get industry data for a client account
 */
export function getIndustryData(accountKey: string): IndustryData | null {
  return INDUSTRY_MAPPING[accountKey] || null
}

/**
 * Get all clients in a specific industry
 */
export function getClientsByIndustry(industry: string): string[] {
  return Object.entries(INDUSTRY_MAPPING)
    .filter(([_, data]) => data.industry === industry)
    .map(([key]) => key)
}

/**
 * Get all unique industries
 */
export function getAllIndustries(): string[] {
  return Array.from(new Set(Object.values(INDUSTRY_MAPPING).map((data) => data.industry)))
}
