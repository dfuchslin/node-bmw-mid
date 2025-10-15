import { CustomEmitter } from '../types/index.js';

export class EventBus extends CustomEmitter<any> {
  constructor() {
    super({ context: 'eventbus' });
  }
}
