const ECHARTS_CDN_VERSION = '6.0.0'

export function renderChartHtml(option: Record<string, unknown>, width = 800, height = 500): string {
  const serializedOption = JSON.stringify(option)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chart</title>
  <style>
    html, body { margin: 0; height: 100%; background: #ffffff; }
    #chart { width: ${width}px; height: ${height}px; margin: 0 auto; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/echarts@${ECHARTS_CDN_VERSION}/dist/echarts.min.js"></script>
</head>
<body>
  <div id="chart"></div>
  <script>
    const chart = echarts.init(document.getElementById('chart'));
    chart.setOption(${serializedOption});
    window.addEventListener('resize', () => chart.resize());
  </script>
</body>
</html>`
}
