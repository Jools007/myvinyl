import type { jsPDF } from 'jspdf';

type FontSpec = {
  url: string;
  vfsName: string;
  family: string;
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
};

const FONTS: FontSpec[] = [
  {
    url: '/fonts/Inter-Regular.ttf',
    vfsName: 'Inter-Regular.ttf',
    family: 'Inter',
    style: 'normal',
  },
  {
    url: '/fonts/Inter-SemiBold.ttf',
    vfsName: 'Inter-SemiBold.ttf',
    family: 'Inter',
    style: 'bold',
  },
  {
    url: '/fonts/DMSans-Bold.ttf',
    vfsName: 'DMSans-Bold.ttf',
    family: 'DMSans',
    style: 'bold',
  },
];

type FontPayload = FontSpec & { data: string };

let fontPayloads: Promise<FontPayload[]> | null = null;
const registeredDocs = new WeakSet<jsPDF>();

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontPayloads(): Promise<FontPayload[]> {
  if (!fontPayloads) {
    fontPayloads = Promise.all(
      FONTS.map(async (font) => {
        const response = await fetch(font.url);
        if (!response.ok) {
          throw new Error(`Font fetch failed: ${font.url}`);
        }
        return {
          ...font,
          data: await arrayBufferToBase64(await response.arrayBuffer()),
        };
      })
    );
  }
  return fontPayloads;
}

export async function ensurePdfFonts(doc: jsPDF): Promise<void> {
  if (registeredDocs.has(doc)) return;
  const payloads = await loadFontPayloads();
  for (const font of payloads) {
    doc.addFileToVFS(font.vfsName, font.data);
    doc.addFont(font.vfsName, font.family, font.style);
  }
  registeredDocs.add(doc);
}

export const PDF_FONT = {
  body: 'Inter',
  display: 'DMSans',
} as const;