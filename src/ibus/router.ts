import Logger from '../lib/log';
import { IbusInterface } from '../lib/ibus';
import { Device, FullIbusMessage, IbusDeviceId } from '../types';
import { MID } from './devices';

const namespace = 'ibus-router';
const log = Logger.get(namespace);
const registeredDevices: Record<IbusDeviceId[keyof IbusDeviceId & number], Device> = {
  [MID.id]: MID,
};

const init = async (ibusInterface: IbusInterface) => {
  ibusInterface.on(namespace, 'data', routeMessage);
  log.notice('Initialized ibus message router');
  Object.values<Device>(registeredDevices).forEach((device) => device.init());
};

const routeMessage = (message: FullIbusMessage) => {
  log.error(`src:${IbusDeviceId[message.src]} dst:${IbusDeviceId[message.dst]} msg:${message.msg}`);
};

const term = async () => {
  //
};

export default {
  init,
  term,
};
