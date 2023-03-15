import { EventEmitter } from 'events';
import Logger from '@/lib/log';
import { LogLevel } from '@/types/lib/log';

// https://rjzaworski.com/2019/10/event-emitters-in-typescript

type EnumType = string | number | symbol;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = { [key in EnumType]: any };
type EventKey<T extends EventMap> = keyof T;
type EventReceiver<T> = (params: T) => void;
type Context = { context: string; logLevel?: LogLevel };

interface Emitter<T extends EventMap> {
  on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: Context): void;

  off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: Context): void;

  emit<K extends EventKey<T>>(eventName: K, params: T[K], ctx?: Context): void;
}

export class CustomEmitter<T extends EventMap> implements Emitter<T> {
  private readonly emitter = new EventEmitter();
  private readonly log;
  private readonly logLevel: LogLevel;
  private readonly parentContext: string;

  constructor(ctx: Context) {
    this.logLevel = ctx.logLevel ?? LogLevel.INFO;
    this.parentContext = ctx.context;
    this.log = Logger.get(`${this.parentContext}:event`);
  }

  on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: Context) {
    this.emitter.on(String(eventName), (params: T[K]) => {
      const logLevel = ctx?.logLevel ?? this.logLevel;
      this.log[logLevel]('%s on event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
      fn(params);
    });
  }

  off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>, ctx?: Context) {
    this.emitter.off(String(eventName), (params: T[K]) => {
      const logLevel = ctx?.logLevel ?? this.logLevel;
      this.log[logLevel]('%s off event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
      fn(params);
    });
  }

  emit<K extends EventKey<T>>(eventName: K, params: T[K], ctx?: Context) {
    const logLevel = ctx?.logLevel ?? this.logLevel;
    this.log[logLevel]('%s emit event:%s data:%O', ctx?.context ?? this.parentContext, eventName, params);
    this.emitter.emit(String(eventName), params);
  }
}
