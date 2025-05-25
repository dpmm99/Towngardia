import { GameState } from "./game/GameState.js";
import { BrowserStorage } from "./storage/BrowserStorage.js";
import { InMemoryStorage } from "./storage/InMemoryStorage.js";
import { NetworkStorage } from "./storage/NetworkStorage.js";
import "./debug.js"; //To make it execute
import { LONG_TICK_TIME } from "./game/FundamentalConstants.js";
import { longTicksToDaysAndHours } from "./ui/UIUtil.js";

declare global {
    var game: GameState;
    var drawCount: number;
}

async function initGame() {
    //const storage = new InMemoryStorage();
    //const storage = new BrowserStorage();
    const storage = new NetworkStorage();
    let canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

    const game = new GameState(storage, canvas, undefined,
        () => { document.getElementById('loadingNotice')!.style.display = "flex"; }, //On load start
        () => { document.getElementById('loadingNotice')!.style.display = "none"; } //On load end
    );
    globalThis.game = game; //For easier debugging
    try {
        await game.initialize();
    } catch (error) {
        console.error(error);
        if (error?.toString().includes("SyntaxError")) {
            window.location.href = "index.html"; //Need to log back in
        }
    }
    await game.switchRenderer(); //To enable graphics

    // Game loop
    let lastFocusLostTime = performance.now();
    let lastTime = performance.now();
    const catchUpNoticeElement = document.getElementById('catchUpNotice')!;
    async function gameLoop() {
        const currentTime = performance.now();

        //If it's been at least 5 minutes since the last frame, we should reload the city.
        if (game.city && game.uiManager && currentTime - lastFocusLostTime > 1000 * 60 * 5) {
            console.log("Reloaded due to out-of-focus time");
            await game.uiManager.switchCity((game.visitingCity || game.city).id, (game.visitingCity || game.city).player);
            lastTime = performance.now(); //Consider it caught up for the moment
            game.uiManager?.draw();
            lastFocusLostTime = currentTime;
            requestAnimationFrame(gameLoop);
            return;
        }
        if (!document.hidden) lastFocusLostTime = currentTime; //Reset that timer if the user is looking at the page

        requestAnimationFrame(gameLoop);
        const isCatchingUp = game.tick();
        catchUpNoticeElement.style.display = isCatchingUp ? "flex" : "none";
        if (isCatchingUp && game.city) {
            const remainingTicks = Math.max(0, Math.floor((Date.now() - game.city.lastLongTick) / LONG_TICK_TIME));
            catchUpNoticeElement.textContent = `Fast-forwarding time...\r\nRemaining: ${longTicksToDaysAndHours(remainingTicks)}`;
        }

        //document.getElementById('catchUpNotice')!.style.display = game.tick() ? "flex" : "none";
        if (game.uiManager?.frameRequested) {
            game.uiManager.frameRequested = false; //Reset it in advance in case the render call requests another frame
            game.uiManager?.draw();
            global.drawCount++; //Can be used for a FPS counter

            //Would be like:
            //const fps = Math.round((drawCount * 1000) / (currentTime - lastTime));
            //TODO: Equivalent of: fpsCounter.textContent = `FPS: ${fps}`;
            //drawCount = 0;

            //But I'mma do this:
            if (game.uiManager.drawFPS) game.renderer?.drawFPS(1000 / (performance.now() - currentTime));
        }
        lastTime = currentTime;
    }
    gameLoop();

    //Save when the user looks away. Otherwise, it's currently only saving on long ticks. I WOULD like to only send the *changes* to the server at some point (see GameAction).
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden && game.city && game.saveWhenHiding && !game.uiManager?.isPlayingMinigame()) {
            console.log("Saved due to visibilitychange");
            await game.fullSave();
            lastFocusLostTime = performance.now();
        }
    });
}

initGame();
