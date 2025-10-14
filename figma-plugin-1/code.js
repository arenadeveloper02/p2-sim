const WS_URL = "wss://abcd1234.execute-api.us-east-1.amazonaws.com/prod";

figma.showUI(__html__, { width: 320, height: 160 });

const ws = new WebSocket(WS_URL);

ws.onopen = () => {
  figma.ui.postMessage({ type: "status", payload: "Connected to AWS WebSocket" });
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  await createDesign(data);
};

ws.onerror = (e) => {
  figma.ui.postMessage({ type: "error", payload: e });
};

async function createDesign(data: any) {
  const page = figma.currentPage;
  const frame = figma.createFrame();
  frame.name = data.title || "Realtime Frame";
  frame.resize(200, 100);
  frame.x = Math.random() * 400;
  frame.y = Math.random() * 400;
  frame.fills = [{ type: "SOLID", color: hexToRgb(data.color || "#22cc88") }];

  const text = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  text.characters = data.title || "New Live Design";
  text.fontSize = 20;
  frame.appendChild(text);
  page.appendChild(frame);
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
