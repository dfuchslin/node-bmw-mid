console.log('Hello world!');

const something = 'some string';
const state = {};

const init_signal_listeners = async () => {
  process.on('SIGTERM', async () => {
    console.log('Caught SIGTERM');
    await term();
  });

  process.on('SIGINT', async () => {
    console.log('Caught SIGINT');
    await term();
  });

  process.on('exit', () => {
    console.log('Exiting');
  });
};

const init = async () => {
  console.log('Initializing');

  await init_signal_listeners();
};

const term = async () => {
  console.log('Terminating');
};

(async () => {
  await init();
})();
