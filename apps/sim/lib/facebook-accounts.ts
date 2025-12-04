export const FACEBOOK_ACCOUNTS = {
  '42_north_dental': {
    id: '15351615',
    name: '42 North Dental',
  },
  ami: {
    id: '172016712813696096',
    name: 'AMI',
  },
  auhi: {
    id: '339741837169741',
    name: 'AUHI',
  },
  acalvio: {
    id: '493502549491904',
    name: 'Acalvio Technologies',
  },
  capital_city_nurses: {
    id: '3262036010793386',
    name: 'Capital City Nurses',
  },
  care_advantage: {
    id: '68881063',
    name: 'Care Advantage',
  },
  eventgroove: {
    id: '932283746830782',
    name: 'Eventgroove',
  },
  great_hill_dental: {
    id: '831337691140681',
    name: 'Great Hill Dental Partners',
  },
  heart_holm: {
    id: '195037387756079',
    name: 'HEART HOLM',
  },
  holm: {
    id: '920469124997773',
    name: 'HOLM',
  },
  health_rhythms: {
    id: '700021935641851',
    name: 'Health Rhythms',
  },
  idi: {
    id: '5211204212264760',
    name: 'IDI',
  },
  msrn: {
    id: '2215802282050378',
    name: 'MSRN',
  },
  nhi: {
    id: '403958260686625',
    name: 'NHI',
  },
  odc_al: {
    id: '356214222317764',
    name: 'ODC AL',
  },
  oia: {
    id: '103243933207663',
    name: 'OIA',
  },
  smi: {
    id: '1171776388875388',
    name: 'SMI',
  },
  silver_lining: {
    id: '1553008092020686',
    name: 'Silver Lining Home Healthcare',
  },
  uconn: {
    id: '110550276165839',
    name: 'UCONN',
  },
  ud: {
    id: '829896744591628',
    name: 'UD',
  },
  uva: {
    id: '2248785611911414',
    name: 'UVA',
  },
  wfbi: {
    id: '243620729450268',
    name: 'WFBI',
  },
  youngs_healthcare: {
    id: '519303850060176',
    name: 'Youngs Healthcare, Inc.',
  },
} as const

export type FacebookAccountKey = keyof typeof FACEBOOK_ACCOUNTS

export function getFacebookAccountId(accountKey: FacebookAccountKey): string {
  return `act_${FACEBOOK_ACCOUNTS[accountKey].id}`
}

export function getFacebookAccountName(accountKey: FacebookAccountKey): string {
  return FACEBOOK_ACCOUNTS[accountKey].name
}
