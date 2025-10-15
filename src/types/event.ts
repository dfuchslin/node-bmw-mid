import { EventEmitter } from 'events';
import Logger from '@/lib/log.js';
import { LogLevel } from '@/types/lib/log.js';

// https://rjzaworski.com/2019/10/event-emitters-in-typescript

type EnumType = string | number | symbol;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = { [key in EnumType]: any };
type EventKey<T extends EventMap> = keyof T;
type EventReceiver<T> = (params: T) => void;
type EventLogContext = { context: string; logLevel?: LogLevel };

interface Emitter<T extends EventMap> {
  on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: EventLogContext): void;

  off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: EventLogContext): void;

  emit<K extends EventKey<T>>(eventName: K, params: T[K], ctx?: EventLogContext): void;
}

export class CustomEmitter<T extends EventMap> implements Emitter<T> {
  private readonly emitter = new EventEmitter();
  private readonly log;
  private readonly logLevel: LogLevel;
  private readonly parentContext: string;

  constructor(ctx: EventLogContext) {
    this.logLevel = ctx.logLevel ?? LogLevel.INFO;
    this.parentContext = ctx.context;
    this.log = Logger.get(`${this.parentContext}:event`);
  }

  on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: EventLogContext) {
    this.emitter.on(String(eventName), (params: T[K]) => {
      const logLevel = ctx?.logLevel ?? this.logLevel;
      this.log[logLevel]('%s on event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
      fn(params);
    });
  }

  off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: EventLogContext) {
    this.emitter.off(String(eventName), (params: T[K]) => {
      const logLevel = ctx?.logLevel ?? this.logLevel;
      this.log[logLevel]('%s off event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
      fn(params);
    });
  }

  emit<K extends EventKey<T>>(eventName: K, params: T[K], ctx?: EventLogContext) {
    const logLevel = ctx?.logLevel ?? this.logLevel;
    this.log[logLevel]('%s emit event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
    this.emitter.emit(String(eventName), params);
  }
}
