import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBaseAlbumDescription } from '../lib/albumDescription';
import { resolveDefaultStickerDescription } from '../lib/labelContent';
import { getLabelPrintProfile, type LabelPrintProfileId } from '../lib/labelProfiles';
import { getPhomemoTransport, PhomemoBleTransport } from '../lib/phomemo/bleTransport';
import { printRasterM220 } from '../lib/phomemo/printM220';
import { rasterForDieCutLabel } from '../lib/phomemo/raster';
import { assertThermalLabelPrintable } from '../lib/labels/qc';
import { renderCalibrationLabelCanvas } from '../lib/labels/renderCalibrationLabelCanvas';
import { renderThermalLabelCanvas } from '../lib/labels/renderThermalLabelCanvas';
import type { VinylRecord } from '../lib/types';

export function usePhomemoPrinter() {
  const transportRef = useRef(getPhomemoTransport());
  const [supported] = useState(() => PhomemoBleTransport.isSupported());
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    const transport = transportRef.current;
    const id = window.setInterval(() => {
      setConnected(transport.isConnected());
      if (transport.isConnected()) {
        setDeviceName(transport.getDeviceName());
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const connect = useCallback(async (options?: { showAllDevices?: boolean }) => {
    const transport = transportRef.current;
    setConnecting(true);
    try {
      await transport.connect(options);
      setConnected(transport.isConnected());
      setDeviceName(transport.getDeviceName());
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await transportRef.current.disconnect();
    setConnected(false);
    setDeviceName(null);
  }, []);

  const printRecords = useCallback(
    async (records: VinylRecord[], profileId: LabelPrintProfileId) => {
      const profile = getLabelPrintProfile(profileId);
      if (!profile.thermal) {
        throw new Error('Selected profile is not a thermal printer profile');
      }
      if (profileId === 'phomemo-40x80') {
        throw new Error('40×80 mm layout is not ready yet — use 40×30 mm for now');
      }

      const transport = transportRef.current;
      if (!transport.isConnected()) {
        await connect();
      }

      setPrinting(true);
      setProgress({ current: 0, total: records.length });

      try {
        const baseById = new Map<string, string>();
        await Promise.all(
          records.map(async (record) => {
            if (record.labelDescription?.trim()) return;
            const album = await fetchBaseAlbumDescription(record);
            const resolved = resolveDefaultStickerDescription(record, album);
            if (resolved) baseById.set(record.id, resolved);
          })
        );

        for (let i = 0; i < records.length; i++) {
          const canvas = await renderThermalLabelCanvas(
            records[i],
            profile.widthMm,
            profile.heightMm,
            { baseDescription: baseById.get(records[i].id) }
          );
          assertThermalLabelPrintable(canvas, profile.widthMm, profile.heightMm);
          const raster = rasterForDieCutLabel(canvas);
          await printRasterM220(transport, raster);
          setProgress({ current: i + 1, total: records.length });
        }
      } finally {
        setPrinting(false);
        setProgress(null);
      }
    },
    [connect]
  );

  const printTestLabel = useCallback(
    async (record: VinylRecord | null, profileId: LabelPrintProfileId) => {
      const fallback = record;
      if (!fallback) {
        throw new Error('Select at least one record to print a test label');
      }
      await printRecords([fallback], profileId);
    },
    [printRecords]
  );

  const printCalibrationLabel = useCallback(
    async (profileId: LabelPrintProfileId) => {
      const profile = getLabelPrintProfile(profileId);
      if (!profile.thermal) {
        throw new Error('Selected profile is not a thermal printer profile');
      }

      const transport = transportRef.current;
      if (!transport.isConnected()) {
        await connect();
      }

      setPrinting(true);
      setProgress({ current: 0, total: 1 });

      try {
        const canvas = await renderCalibrationLabelCanvas(
          profile.widthMm,
          profile.heightMm
        );
        const raster = rasterForDieCutLabel(canvas);
        await printRasterM220(transport, raster);
        setProgress({ current: 1, total: 1 });
      } finally {
        setPrinting(false);
        setProgress(null);
      }
    },
    [connect]
  );

  return {
    supported,
    connected,
    connecting,
    deviceName,
    printing,
    progress,
    connect,
    disconnect,
    printRecords,
    printTestLabel,
    printCalibrationLabel,
  };
}