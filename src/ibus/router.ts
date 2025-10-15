import Logger from '@/lib/log.js';
import { IbusInterface } from '@/lib/ibus/index.js';
import { Device, FullIbusMessage, IbusDeviceId } from '@/types/index.js';
//import { CDC, IKE, MID, RAD, TEL } from '@/ibus/devices';
import * as AllDevices from '@/ibus/devices/index.js';
import { deviceStatus } from '@/ibus/message.js';
import { EventBus } from '@/eventbus/index.js';
import cdcnew from '@/ibus/devices/IbusDevice.js';

const context = 'ibus-router';
const log = Logger.get(context);
let ibusInterface: IbusInterface;

const registeredDevices: Record<number, Device> = {};
//const registeredDevices: Record<number, Device> = {
//  [CDC.id]: CDC,
//  [IKE.id]: IKE,
//  [MID.id]: MID,
//  [RAD.id]: RAD,
//  [TEL.id]: TEL,
//};

const init = async (config: { ibusInterface: IbusInterface; eventBus: EventBus }) => {
  ibusInterface = config.ibusInterface;
  ibusInterface.on('data', routeMessage, { context });
  log.notice('Initialized ibus message router');
  // Object.values<Device>(registeredDevices).forEach((device) => device.init(ibusInterface));
  Object.values(AllDevices).forEach((device) => (registeredDevices[device.id] = device));

  const CDCNEW = new cdcnew(config);
  registeredDevices[CDCNEW.id] = CDCNEW;

  Object.values<Device>(registeredDevices).forEach((device) => device.init(config.ibusInterface));
};

const routeMessage = (message: FullIbusMessage) => {
  switch (message.msg[0]) {
    case 0x01: {
      return handleDeviceStatusRequest(message);
    }

    case 0x02: {
      return handleDeviceStatusResponse(message);
    }
  }

  const destination = registeredDevices[message.dst];
  if (destination) {
    return destination.parseMessage(message);
  }

  log.error(`unhandled src:${IbusDeviceId[message.src]} dst:${IbusDeviceId[message.dst]} msg:`, message.msg);
};

const handleDeviceStatusRequest = (message: FullIbusMessage) => {
  ibusInterface.sendMessage(deviceStatus(message.dst));
};

const handleDeviceStatusResponse = (message: FullIbusMessage) => {
  log.debug('Got device status response from device', message);
};

const term = async () => {
  //
};

export default {
  init,
  term,
};
