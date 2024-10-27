const LONG_TICK_TIME = 6 * 60 * 60 * 1000; //60000; //Every 6 hours, 6 * 60 * 60 * 1000. I had shortened it for testing.
const SHORT_TICK_TIME = 5 * 60 * 1000; //833; //Every 5 minutes, 5 * 60 * 1000. I had shortened it for testing.
const LONG_TICKS_PER_DAY = 4; //The intended final number. 24 hours / 6 hours = 4
const SHORT_TICKS_PER_LONG_TICK = 72; //The intended final number. 6 hours / 5 minutes = 72

export { LONG_TICK_TIME, SHORT_TICK_TIME, LONG_TICKS_PER_DAY, SHORT_TICKS_PER_LONG_TICK };