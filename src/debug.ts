//Debug functions

import { LONG_TICK_TIME } from "./game/FundamentalConstants.js";

let cheatTypingBuffer = '';
let cheatLastKeyTime = Date.now();
const cheatResetDelay = 1000;
document.addEventListener('keydown', function (event) {
    const currentTime = Date.now();

    // Reset buffer if it's been more than 1 second since the last keypress
    if (currentTime - cheatLastKeyTime > cheatResetDelay) {
        cheatTypingBuffer = '';
    }

    // Update the buffer with the new character
    cheatTypingBuffer += event.key.toLowerCase();

    // Check if the buffer ends with the cheat phrase
    if (cheatTypingBuffer.endsWith('show me the money')) {
        resourceCheat();
        globalThis.game.uiManager!.frameRequested = true;
        cheatTypingBuffer = '';
    } else if (cheatTypingBuffer.endsWith('modify the phase variance')) {
        buildingsCheat();
        globalThis.game.uiManager!.frameRequested = true;
        cheatTypingBuffer = '';
    } else if (cheatTypingBuffer.endsWith('operation cwal')) {
        timeCheat();
        globalThis.game.uiManager!.frameRequested = true;
        cheatTypingBuffer = '';
    }

    cheatLastKeyTime = currentTime;
});

function resourceCheat() {
    console.log('Rosebud!');
    for (const resource of globalThis.game.city!.resources.values()) {
        if (resource.isSpecial && resource.type != 'flunds') continue;
        resource.amount += 100;
        if (resource.capacity < 10000) resource.capacity += 100;
        else resource.amount += 5000;
    }
}

function buildingsCheat() {
    console.log('Pay tribute!');
    for (const type of globalThis.game.city!.buildingTypes.values()) {
        type.locked = false;
    }
    globalThis.game.city!.enableResourceConstruction();
}

function timeCheat() {
    console.log("Cheetah!");
    globalThis.game.city!.lastShortTick -= LONG_TICK_TIME;
    globalThis.game.city!.lastLongTick -= LONG_TICK_TIME;
}
