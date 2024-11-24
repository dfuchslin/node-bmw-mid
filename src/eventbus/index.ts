import { CustomEmitter } from '@/types';

export class EventBus extends CustomEmitter<any> {
  constructor() {
    super({ context: 'eventbus' });
  }
}
