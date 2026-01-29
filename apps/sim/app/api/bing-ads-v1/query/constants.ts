/**
 * Constants for Bing Ads V1 API
 */

/**
 * Conversion factor from micros to dollars
 * Bing Ads represents currency in micros (1 million micros = 1 dollar)
 */
export const MICROS_PER_DOLLAR = 1000000

/**
 * Current date reference for Bing Ads query generation
 * Dynamically calculated to always reflect the actual current date
 */
export const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/**
 * Default date range in days when no date is specified
 */
export const DEFAULT_DATE_RANGE_DAYS = 30

/**
 * Bing Ads accounts mapping (same as current Bing Ads - ALL 83 accounts)
 */
export const BING_ADS_ACCOUNTS: Record<string, { id: string; name: string; customerId?: string }> = {
  position2_inc: { id: 'C000736328', name: 'Position2 Inc.' },
  '247insider': { id: 'F113ZL2Q', name: '247Insider.com' },
  absolute_software: { id: 'X7721510', name: 'Absolute Software' },
  altula: { id: '1772290', name: 'Altula', customerId: '12187584' },
  amazon_b2b: { id: '41073055', name: 'Amazon B2B', customerId: '12187584' },
  amazon_web_services: { id: '40043856', name: 'Amazon Web Services', customerId: '12187584' },
  antivirusreviews: { id: 'F120FMNQ', name: 'AntiVirusReviews.com' },
  autoarena: { id: 'F119PZDA', name: 'AutoArena.com' },
  bargain_net: { id: 'F120JYA3', name: 'Bargain.net' },
  beauterre: { id: '174103967', name: 'Beauterre', customerId: '12187584' },
  big_g_creative: { id: '173030922', name: 'Big G Creative', customerId: '12187584' },
  bingelocal: { id: 'F120VDGC', name: 'BingeLocal.net' },
  blackfridaystreet: { id: '149228244', name: 'BlackFridayStreet.com', customerId: '12187584' },
  blackfriyay: { id: '150206994', name: 'BlackFriyay.com', customerId: '12187584' },
  botmetric: { id: '71097445', name: 'Botmetric', customerId: '12187584' },
  businessbytes: { id: 'F118NT2T', name: 'BusinessBytes.net' },
  capitalcitynurses: { id: 'F120K5EG', name: 'CapitalCityNurses.com' },
  careadvantage: { id: 'F120L8EF', name: 'CareAdvantage' },
  cellphones_guru: { id: 'F120QC4N', name: 'Cellphones.Guru Bing' },
  comfort_soul: { id: '150375186', name: 'Comfort Soul', customerId: '12187584' },
  cutting_edge_firewood: { id: '151097420', name: 'Cutting Edge Firewood', customerId: '12187584' },
  cybermondaypicks: { id: 'F119JS7T', name: 'CyberMondayPicks.com' },
  dealsdivine: { id: 'F119T3ZT', name: 'DealsDivine.com' },
  dealsfarms: { id: 'F119FJLP', name: 'DealsFarms.com' },
  discoverlocal: { id: 'F120QD4Q', name: 'DiscoverLocal.net' },
  factuia: { id: 'F113ZYXE', name: 'Factuia.com' },
  findanswerstoday: { id: 'F119YZNS', name: 'FindAnswersToday.com' },
  gentle_dental: { id: '151000820', name: 'Gentle Dental', customerId: '12187584' },
  healthatoz: { id: 'F118679G', name: 'HealthAtoZ.net Bing' },
  hunter_fans: { id: 'F120FD4H', name: 'Hunter Fans' },
  infosavant: { id: 'F113NE34', name: 'InfoSavant.net' },
  karrot: { id: '47022035', name: 'Karrot', customerId: '12187584' },
  kitchenaid: { id: '139031647', name: 'KitchenAid', customerId: '12187584' },
  knownemo: { id: 'F119EYGD', name: 'KnowNemo.com' },
  localwizard: { id: 'F120MKTP', name: 'Localwizard.net' },
  mobilesarena: { id: 'F118791H', name: 'MobilesArena.com' },
  offerspod: { id: '150425708', name: 'OffersPod.com', customerId: '12187584' },
  position2mcc: { id: '2482901', name: 'position2mcc', customerId: '12187584' },
  power_wizard: { id: '180047830', name: 'Power Wizard', customerId: '12187584' },
  quorumlabs: { id: '1657574', name: 'QuorumLabs, Inc', customerId: '12187584' },
  reciprocity: { id: '163026540', name: 'Reciprocity Inc.', customerId: '12187584' },
  resultsbee: { id: 'F120SGQF', name: 'Resultsbee.com' },
  rheem_commercial: { id: 'F120MPUQ', name: 'Rheem Commercial-Water' },
  richrelevance: { id: '173097178', name: 'RichRelevance', customerId: '12187584' },
  ruckus: { id: '151000217', name: 'Ruckus', customerId: '12187584' },
  sandstone_diagnostics: { id: '139036399', name: 'Sandstone Diagnostics', customerId: '12187584' },
  seasondeals: { id: 'F1203CJ7', name: 'seasondeals.store' },
  seeknemo_uk: { id: 'F119ZUAP', name: 'SeekNemo.com - UK' },
  au_eventgroove: { id: '2764923', name: 'AU - Eventgroove Products', customerId: '6716' },
  ca_eventgroove: { id: '2744189', name: 'CA - Eventgroove', customerId: '6716' },
  uk_eventgroove: { id: '2744166', name: 'UK - Eventgroove', customerId: '6716' },
  us_eventgroove: { id: '6035', name: 'US - Eventgroove', customerId: '6716' },
  perforated_paper: { id: '33003078', name: 'Perforated Paper', customerId: '6716' },
  health_rhythms: { id: '151506406', name: 'Health Rhythms Inc', customerId: '253417434' },
  serenity_acres: { id: '157103079', name: 'Serenity Acres', customerId: '12187584' },
  shoppers_arena: { id: '151003010', name: 'ShoppersArena.net', customerId: '12187584' },
  smart_discounts: { id: '150197206', name: 'SmartDiscounts.net', customerId: '12187584' },
  lg10: { id: '138353461', name: 'LG10', customerId: '252933728' },
  lg11: { id: '138353463', name: 'LG11', customerId: '252933728' },
  lg12: { id: '138353464', name: 'LG12', customerId: '252933728' },
  lg13: { id: '138353466', name: 'LG13', customerId: '252933728' },
  lg14: { id: '138353468', name: 'LG14', customerId: '252933728' },
  lg15: { id: '138353469', name: 'LG15', customerId: '252933728' },
  lg16: { id: '138353472', name: 'LG16', customerId: '252933728' },
  lg17: { id: '138353473', name: 'LG17', customerId: '252933728' },
  lg18: { id: '138353473', name: 'LG18', customerId: '252933728' },
  lg19: { id: '138353446', name: 'LG19', customerId: '252933728' },
  lg20: { id: '138353454', name: 'LG20', customerId: '252933728' },
  lg21: { id: '138353456', name: 'LG21', customerId: '252933728' },
  lg22: { id: '138353458', name: 'LG22', customerId: '252933728' },
  lg23: { id: '138353485', name: 'LG23', customerId: '252933728' },
  lg24: { id: '138353486', name: 'LG24', customerId: '252933728' },
  lg25: { id: '138353492', name: 'LG25', customerId: '252933728' },
  lg26: { id: '138353494', name: 'LG26', customerId: '252933728' },
  lg27: { id: '138353497', name: 'LG27', customerId: '252933728' },
  lg28: { id: '138353499', name: 'LG28', customerId: '252933728' },
  lg29: { id: '138353502', name: 'LG29', customerId: '252933728' },
  lg30: { id: '138353504', name: 'LG30', customerId: '252933728' },
  lg7: { id: '138353435', name: 'LG7', customerId: '252933728' },
  lg8: { id: '138353436', name: 'LG8', customerId: '252933728' },
  lg9: { id: '138353442', name: 'LG9', customerId: '252933728' },
  lifelines_llc: { id: '180411374', name: 'Lifelines LLC', customerId: '251431430' },
  xoriant: { id: '180272408', name: 'Xoriant', customerId: '251175768' },
}
