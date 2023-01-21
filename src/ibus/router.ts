import Logger from '../lib/log';
import { IbusInterface } from '../lib/ibus';
import { Device, FullIbusMessage, IbusDeviceId } from '../types';
import { IKE, MID, RAD, TEL } from './devices';
import { CDC } from './devices/CDC';

const namespace = 'ibus-router';
const log = Logger.get(namespace);

const registeredDevices: Record<number, Device> = {
  [CDC.id]: CDC,
  [IKE.id]: IKE,
  [MID.id]: MID,
  [RAD.id]: RAD,
  [TEL.id]: TEL,
};

const init = async (ibusInterface: IbusInterface) => {
  ibusInterface.on(namespace, 'data', routeMessage);
  log.notice('Initialized ibus message router');
  Object.values<Device>(registeredDevices).forEach((device) => device.init(ibusInterface));
};

const routeMessage = (message: FullIbusMessage) => {
  const destination = registeredDevices[message.dst];
  if (destination) {
    return destination.parseMessage(message);
  }

  log.error(
    `unhandled src:${IbusDeviceId[message.src]} dst:${IbusDeviceId[message.dst]} msg:${message.msg}`
  );
};

const term = async () => {
  //
};

export default {
  init,
  term,
};
