//Debug functions

import { LONG_TICK_TIME } from "./game/FundamentalConstants.js";
import { Tech } from "./game/Tech.js";

let cheatTypingBuffer = '';
let cheatLastKeyTime = Date.now();
let timeCheatKeyAdded = false;
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
    } else if (cheatTypingBuffer.endsWith('medieval man')) {
        techEditCheat();
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
        type.isHidden = type.locked = false;
    }
    globalThis.game.city!.enableResourceConstruction();
}

function timeCheat() {
    console.log("Cheetah!");
    globalThis.game.city!.lastShortTick -= LONG_TICK_TIME;
    globalThis.game.city!.lastLongTick -= LONG_TICK_TIME;
    if (!timeCheatKeyAdded) {
        window.addEventListener("keydown", (event) => { if (event.key === "ArrowRight") timeCheat(); })
        timeCheatKeyAdded = true;
    }
}

function techEditCheat() {
    console.log("Nice tech!");
    document.addEventListener('keydown', function (event) {
        const tech = <Tech | undefined>(<any>game.uiManager!).techMenu?.selectedTech;
        if (!tech) return;
        const step = 20;
        switch (event.key) {
            case 'ArrowUp':
                tech.displayY -= step;
                break;
            case 'ArrowDown':
                tech.displayY += step;
                break;
            case 'ArrowLeft':
                tech.displayX -= step;
                break;
            case 'ArrowRight':
                tech.displayX += step;
                break;
            default:
                return;
        }
        console.log(`${tech.name} @ (${tech.displayX}, ${tech.displayY})`);

        event.preventDefault();
        game.uiManager!.frameRequested = true;
    });
}