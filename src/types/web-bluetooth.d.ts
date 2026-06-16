/** Minimal Web Bluetooth types for Phomemo thermal printing (Chrome/Edge). */
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  watchAdvertisements?(options?: WatchAdvertisementsOptions): Promise<void>;
  addEventListener(
    type: 'advertisementreceived' | 'gattserverdisconnected',
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void;
}

interface WatchAdvertisementsOptions {
  signal?: AbortSignal;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  readonly properties: BluetoothCharacteristicProperties;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothCharacteristicProperties {
  readonly read: boolean;
  readonly write: boolean;
  readonly writeWithoutResponse: boolean;
  readonly notify: boolean;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

interface BluetoothLEScanFilter {
  namePrefix?: string;
}

interface Bluetooth extends EventTarget {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}