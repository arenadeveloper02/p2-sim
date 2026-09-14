/** Representative ChatGPT paste: React weather SPA, not an Arena brief. */
export const CHATGPT_WEATHER_DASHBOARD_BRIEF = `
Build a professional weather dashboard in React.

Use Open-Meteo geocoding and forecast APIs. Autocomplete city search as the user types.
Use browser geolocation for "use my location". Persist last city in localStorage.
Toggle °C/°F client-side.

Current conditions with weather icons from WMO weather_code.
Horizontal hourly filmstrip highlighting this hour.
7-day forecast as compact cards nested in a grouping card.
Insights: visibility, pressure, UV.

Custom visual system: hex #0EA5E9, custom logo, weather-influenced motion,
in-app light/dark toggle.

Seven data-state screens: skeleton screens, searching locations, loading weather,
empty, error, partial, retry.

Put a React service layer in src/lib/weather.ts and components in src/components.
`.trim()
