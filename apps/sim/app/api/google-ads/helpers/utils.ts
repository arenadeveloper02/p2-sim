// Google Ads utility functions

// Google Ads accounts configuration - shared reference
export const GOOGLE_ADS_ACCOUNTS: Record<string, { id: string; name: string }> = {
  ami: { id: '7284380454', name: 'AMI' },
  heartland: { id: '4479015711', name: 'Heartland' },
  nhi: { id: '2998186794', name: 'NHI' },
  oic_culpeper: { id: '8226685899', name: 'OIC-Culpeper' },
  odc_al: { id: '1749359003', name: 'ODC-AL' },
  cpic: { id: '1757492986', name: 'CPIC' },
  idi_fl: { id: '1890773395', name: 'IDI-FL' },
  smi: { id: '9960845284', name: 'SMI' },
  holmdel_nj: { id: '3507263995', name: 'Holmdel-NJ' },
  ft_jesse: { id: '4443836419', name: 'Ft. Jesse' },
  ud: { id: '8270553905', name: 'UD' },
  wolf_river: { id: '6445143850', name: 'Wolf River' },
  phoenix_rehab: { id: '4723354550', name: 'Phoenix Rehab (NEW - WM Invoices)' },
  au_eventgroove_products: { id: '3365918329', name: 'AU - Eventgroove Products' },
  us_eventgroove_products: { id: '4687328820', name: 'US - Eventgroove Products' },
  ca_eventgroove_products: { id: '5197514377', name: 'CA - Eventgroove Products' },
  perforated_paper: { id: '8909188371', name: 'Perforated Paper' },
  uk_eventgroove_products: { id: '7662673578', name: 'UK - Eventgroove Products' },
  monster_transmission: { id: '2680354698', name: 'Monster Transmission' },
  careadvantage: { id: '9059182052', name: 'CareAdvantage' },
  capitalcitynurses: { id: '8395621144', name: 'CapitalCityNurses.com' },
  silverlininghealthcare: { id: '4042307092', name: 'Silverlininghealthcare.com' },
  youngshc: { id: '3240333229', name: 'Youngshc.com' },
  nova_hhc: { id: '9279793056', name: 'Nova HHC' },
  inspire_aesthetics: { id: '1887900641', name: 'Inspire Aesthetics' },
  mosca_plastic_surgery: { id: '8687457378', name: 'Mosca Plastic Surgery' },
  marietta_plastic_surgery: { id: '6374556990', name: 'Marietta Plastic Surgery' },
  daniel_shapiro: { id: '7395576762', name: 'Daniel I. Shapiro, M.D., P.C.' },
  southern_coastal: { id: '2048733325', name: 'Southern Coastal' },
  plastic_surgery_center_hr: { id: '1105892184', name: 'Plastic Surgery Center of Hampton Roads' },
  epstein: { id: '1300586568', name: 'EPSTEIN' },
  covalent_metrology: { id: '3548685960', name: 'Covalent Metrology' },
  gentle_dental: { id: '2497090182', name: 'Gentle Dental' },
  great_hill_dental: { id: '6480839212', name: 'Great Hill Dental' },
  dynamic_dental: { id: '4734954125', name: 'Dynamic Dental' },
  great_lakes: { id: '9925296449', name: 'Great Lakes' },
  southern_ct_dental: { id: '7842729643', name: 'Southern Connecticut Dental Group' },
  dental_care_associates: { id: '2771541197', name: 'Dental Care Associates' },
  service_air_eastern_shore: { id: '8139983849', name: 'Service Air Eastern Shore' },
  chancey_reynolds: { id: '7098393346', name: 'Chancey & Reynolds' },
  howell_chase: { id: '1890712343', name: 'Howell Chase' },
}

/**
 * Get account ID by account name or key
 */
export function getAccountId(accountNameOrKey: string): string | null {
  // First try direct key lookup
  if (GOOGLE_ADS_ACCOUNTS[accountNameOrKey]) {
    return GOOGLE_ADS_ACCOUNTS[accountNameOrKey].id
  }

  // Then try name lookup (case insensitive)
  const accountKey = Object.keys(GOOGLE_ADS_ACCOUNTS).find(
    key => GOOGLE_ADS_ACCOUNTS[key].name.toLowerCase() === accountNameOrKey.toLowerCase()
  )
  
  return accountKey ? GOOGLE_ADS_ACCOUNTS[accountKey].id : null
}

/**
 * Extract account name from user query
 */
export function extractAccountFromQuery(query: string): string | null {
  const queryLower = query.toLowerCase()
  
  // Look for account names in the query
  for (const [key, account] of Object.entries(GOOGLE_ADS_ACCOUNTS)) {
    if (queryLower.includes(account.name.toLowerCase()) || queryLower.includes(key)) {
      return account.name
    }
  }
  
  return null
}

/**
 * Extract campaign name from user query
 */
export function extractCampaignFromQuery(query: string): string | null {
  // Look for common campaign patterns
  const campaignPatterns = [
    /campaign\s+([A-Za-z0-9_\-\s]+)/i,
    /for\s+campaign\s+([A-Za-z0-9_\-\s]+)/i,
    /in\s+campaign\s+([A-Za-z0-9_\-\s]+)/i,
    /P2_[A-Za-z0-9_\-]+/i, // Position2 campaign pattern
  ]
  
  for (const pattern of campaignPatterns) {
    const match = query.match(pattern)
    if (match) {
      return match[1] || match[0]
    }
  }
  
  return null
}
