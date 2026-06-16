import { PHOMEMO_BLE } from './constants';

type BluetoothNavigator = Navigator & {
  bluetooth: Bluetooth;
};

const DEVICE_NAME_PREFIXES = [
  'M',
  'D',
  'P',
  'Q',
  'T',
  'A',
  'Mr.in',
  'Phomemo',
] as const;

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 300;

export class PhomemoBleTransport {
  private device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private connected = false;
  private useWriteWithResponse = false;
  private disconnectHandlerAttached = false;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  isConnected(): boolean {
    return (
      this.connected &&
      Boolean(this.device?.gatt?.connected) &&
      this.writeChar !== null
    );
  }

  getDeviceName(): string {
    return this.device?.name ?? 'Phomemo';
  }

  async connect(options?: { showAllDevices?: boolean }): Promise<void> {
    if (!PhomemoBleTransport.isSupported()) {
      throw new Error('Web Bluetooth is not supported. Use Chrome or Edge on desktop.');
    }

    if (this.isConnected()) return;

    const bluetooth = (navigator as BluetoothNavigator).bluetooth;

    if (this.device) {
      try {
        await this.retryWithBackoff(() => this.connectGatt());
        return;
      } catch {
        this.device = null;
      }
    }

    if (!options?.showAllDevices) {
      const reconnected = await this.tryReconnectGrantedDevices();
      if (reconnected) return;
    }

    for (let pickerAttempt = 0; pickerAttempt < 3; pickerAttempt++) {
      this.device = await this.requestDevice(bluetooth, options?.showAllDevices === true);
      await this.waitForDeviceReady();

      try {
        await this.retryWithBackoff(() => this.connectGatt());
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Unsupported')) {
          this.device = null;
          await this.delay(500);
          continue;
        }
        throw err;
      }
    }

    throw new Error('Could not connect to the printer. Try again or hold Shift while clicking Connect.');
  }

  async disconnect(): Promise<void> {
    if (this.notifyChar) {
      try {
        await this.notifyChar.stopNotifications();
      } catch {
        /* device may already be gone */
      }
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.connected = false;
    this.writeChar = null;
    this.notifyChar = null;
    this.device = null;
    this.disconnectHandlerAttached = false;
  }

  async send(data: Uint8Array | ArrayBuffer): Promise<void> {
    if (!this.isConnected() || !this.writeChar) {
      throw new Error('Printer not connected');
    }

    const buffer =
      data instanceof Uint8Array ? new Uint8Array(data).buffer : data;

    if (this.useWriteWithResponse) {
      await this.writeChar.writeValue(buffer);
    } else {
      try {
        await this.writeChar.writeValueWithoutResponse(buffer);
      } catch {
        this.useWriteWithResponse = true;
        await this.writeChar.writeValue(buffer);
      }
    }
  }

  async sendChunked(
    data: Uint8Array,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const { CHUNK_SIZE, CHUNK_DELAY_MS } = PHOMEMO_BLE;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, Math.min(i + CHUNK_SIZE, data.length));
      await this.send(chunk);
      await this.delay(CHUNK_DELAY_MS);
      if (onProgress) {
        onProgress(Math.round(((i + chunk.length) / data.length) * 100));
      }
    }
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async tryReconnectGrantedDevices(): Promise<boolean> {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!('getDevices' in bluetooth)) return false;

    const getDevices = bluetooth.getDevices;
    if (!getDevices) return false;
    const granted = await getDevices.call(bluetooth);
    const candidates = granted.filter((d) => this.looksLikePhomemo(d.name));

    for (const device of candidates) {
      try {
        this.device = device;
        await this.waitForDeviceReady();
        await this.retryWithBackoff(() => this.connectGatt());
        return true;
      } catch {
        this.device = null;
      }
    }

    return false;
  }

  private looksLikePhomemo(name?: string): boolean {
    if (!name) return false;
    return DEVICE_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
  }

  private async requestDevice(
    bluetooth: Bluetooth,
    showAllDevices: boolean
  ): Promise<BluetoothDevice> {
    const optionalServices = PHOMEMO_BLE.ALT_SERVICE_UUIDS as BluetoothServiceUUID[];

    if (showAllDevices) {
      return bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    }

    try {
      return await bluetooth.requestDevice({
        filters: DEVICE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
        optionalServices,
      });
    } catch {
      return bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    }
  }

  private async waitForDeviceReady(timeoutMs = 5000): Promise<void> {
    if (!this.device) return;

    if (!this.device.watchAdvertisements) {
      await this.delay(2000);
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const timer = window.setTimeout(finish, timeoutMs);
      const abort = new AbortController();

      this.device!.addEventListener(
        'advertisementreceived',
        () => {
          window.clearTimeout(timer);
          abort.abort();
          finish();
        },
        { once: true }
      );

      const watch = this.device!.watchAdvertisements;
      if (watch) {
        void watch.call(this.device!, { signal: abort.signal }).catch(finish);
      } else {
        finish();
      }
    });
  }

  private async retryWithBackoff(fn: () => Promise<void>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await this.delay(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Bluetooth connection failed');
  }

  private async connectGatt(): Promise<void> {
    if (!this.device?.gatt) {
      throw new Error('Selected device does not support Bluetooth GATT');
    }

    if (!this.disconnectHandlerAttached) {
      this.device.addEventListener('gattserverdisconnected', () => {
        this.connected = false;
        this.writeChar = null;
        this.notifyChar = null;
      });
      this.disconnectHandlerAttached = true;
    }

    this.connected = false;
    this.writeChar = null;
    this.notifyChar = null;

    const server = await this.device.gatt.connect();
    await this.delay(150);

    let service: BluetoothRemoteGATTService | null = null;
    let lastError: unknown;
    for (const uuid of PHOMEMO_BLE.ALT_SERVICE_UUIDS) {
      try {
        service = await server.getPrimaryService(uuid as BluetoothServiceUUID);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!service) {
      throw new Error(
        `No compatible Bluetooth service found${lastError instanceof Error ? `: ${lastError.message}` : ''}`
      );
    }

    this.writeChar = await service.getCharacteristic(PHOMEMO_BLE.WRITE_CHAR_UUID);
    const props = this.writeChar.properties;
    this.useWriteWithResponse = !props.writeWithoutResponse && props.write;

    try {
      this.notifyChar = await service.getCharacteristic(PHOMEMO_BLE.NOTIFY_CHAR_UUID);
      await this.notifyChar.startNotifications();
    } catch {
      this.notifyChar = null;
    }

    this.connected = true;
  }
}

let sharedTransport: PhomemoBleTransport | null = null;

export function getPhomemoTransport(): PhomemoBleTransport {
  if (!sharedTransport) {
    sharedTransport = new PhomemoBleTransport();
  }
  return sharedTransport;
}