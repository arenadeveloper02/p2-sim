// Google Business Profile accounts and locations configuration
export const GOOGLE_BUSINESS_ACCOUNTS: Record<
  string,
  {
    accountId: string
    accountName: string
    locations: Record<string, { locationId: string; name: string }>
  }
> = {
  zansam: {
    accountId: '5505891809036041266',
    accountName: 'Zansam Music and Concerts Group',
    locations: {
      bengaluru: {
        locationId: '9943309034297338857',
        name: 'Zansam Music and Concerts Group - Bengaluru',
      },
    },
  },
  brushandfloss: {
    accountId: '3197717418B11089516',
    accountName: 'BrushAndFloss Orthodontics',
    locations: {
      knightdale: {
        locationId: '12481056963961188346', // From Google Business Profile URL
        name: 'BrushAndFloss Orthodontics - Knightdale',
      },
      clayton: {
        locationId: 'LOCATION_ID_CLAYTON', // Replace with actual ID from Google
        name: 'BrushAndFloss Orthodontics - Clayton',
      },
      selma: {
        locationId: 'LOCATION_ID_SELMA', // Replace with actual ID from Google
        name: 'BrushAndFloss Orthodontics - Selma',
      },
      garner: {
        locationId: 'LOCATION_ID_GARNER', // Replace with actual ID from Google
        name: 'BrushAndFloss Orthodontics and Pediatrics - Garner',
      },
      monkey_junction: {
        locationId: 'LOCATION_ID_MONKEY_JUNCTION', // Replace with actual ID from Google
        name: 'BrushAndFloss Orthodontics Monkey Junction',
      },
      wilmington: {
        locationId: 'LOCATION_ID_WILMINGTON', // Replace with actual ID from Google
        name: 'Brush and Floss Specialty Porters Neck',
      },
      flowersPeds: {
        locationId: 'LOCATION_ID_FLOWERSPEDS', // Replace with actual ID from Google
        name: 'Brush and Floss Pediatric Dentistry - Clayton',
      },
      selmaKids: {
        locationId: 'LOCATION_ID_SELMAKIDS', // Replace with actual ID from Google
        name: 'Brush and Floss Pediatric Dentistry - Selma',
      },
    },
  },
}
