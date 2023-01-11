import { Gpio } from 'onoff';
import { Globals } from '../types';

let globals: Globals;
let rpi_gpio: any;

const init = async (g: Globals) => {
  globals = g;
};

const term = async () => {
  //
};

export default {
  init,
  term,
};
