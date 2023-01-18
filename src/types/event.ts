import { EventEmitter } from 'events';
import Logger from '../lib/log';

// https://rjzaworski.com/2019/10/event-emitters-in-typescript

type EventMap = Record<string, any>;

type EventKey<T extends EventMap> = string & keyof T;
type EventReceiver<T> = (params: T) => void;

interface Emitter<T extends EventMap> {
  on<K extends EventKey<T>>(sourceNamespace: string, eventName: K, fn: EventReceiver<T[K]>): void;
  off<K extends EventKey<T>>(sourceNamespace: string, eventName: K, fn: EventReceiver<T[K]>): void;
  emit<K extends EventKey<T>>(sourceNamespace: string, eventName: K, params: T[K]): void;
}

export class CustomEmitter<T extends EventMap> implements Emitter<T> {
  private emitter = new EventEmitter();
  private log;

  constructor(parentNamespace: string) {
    this.log = Logger.get(`${parentNamespace}:event`);
  }

  on<K extends EventKey<T>>(sourceNamespace: string, eventName: K, fn: EventReceiver<T[K]>) {
    this.emitter.on(eventName, (params: T[K]) => {
      this.log.info('%s on event:%s data:%O', sourceNamespace, eventName, params);
      fn(params);
    });
  }

  off<K extends EventKey<T>>(sourceNamespace: string, eventName: K, fn: EventReceiver<T[K]>) {
    this.emitter.off(eventName, (params: T[K]) => {
      this.log.info('%s off event:%s data:%O', sourceNamespace, eventName, params);
      fn(params);
    });
  }

  emit<K extends EventKey<T>>(sourceNamespace: string, eventName: K, params: T[K]) {
    this.log.info('%s emit event:%s data:%O', sourceNamespace, eventName, params);
    this.emitter.emit(eventName, params);
  }
}
