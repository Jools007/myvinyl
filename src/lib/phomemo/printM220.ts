import { M220_CONFIG } from './constants';
import type { PhomemoBleTransport } from './bleTransport';
import type { RasterData } from './raster';

const CMD = {
  INIT: new Uint8Array([0x1b, 0x40]),
  FEED: (dots: number) => new Uint8Array([0x1b, 0x4a, dots]),
  DENSITY: (level: number) => new Uint8Array([0x1d, 0x7c, level]),
  HEAT_SETTINGS: (maxDots: number, heatTime: number, heatInterval: number) =>
    new Uint8Array([0x1b, 0x37, maxDots, heatTime, heatInterval]),
  RASTER_HEADER: (widthBytes: number, heightLines: number) =>
    new Uint8Array([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes, 0x00,
      heightLines & 0xff,
      (heightLines >> 8) & 0xff,
    ]),
};

function densityToHeatTime(density: number): number {
  const heatTimes = [40, 60, 80, 100, 120, 140, 160, 200];
  return heatTimes[Math.max(0, Math.min(7, density - 1))];
}

/** Print raster data to M220 via BLE (m-series protocol, phomymo-derived). */
export async function printRasterM220(
  transport: PhomemoBleTransport,
  raster: RasterData,
  options?: {
    density?: number;
    feed?: number;
    onProgress?: (percent: number) => void;
  }
): Promise<void> {
  const density = options?.density ?? M220_CONFIG.density;
  const feed = options?.feed ?? M220_CONFIG.feedDots;
  const { data, widthBytes, heightLines } = raster;

  await transport.send(CMD.INIT);
  await transport.delay(100);

  const heatTime = densityToHeatTime(density);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);
  await transport.send(CMD.DENSITY(density));
  await transport.delay(50);

  await transport.send(CMD.RASTER_HEADER(widthBytes, heightLines));
  await transport.sendChunked(data, options?.onProgress);

  await transport.delay(300);
  await transport.send(CMD.FEED(feed));
  await transport.delay(800);
}