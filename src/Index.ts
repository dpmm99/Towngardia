import { GameState } from "./game/GameState.js";
import { BrowserStorage } from "./storage/BrowserStorage.js";
import { InMemoryStorage } from "./storage/InMemoryStorage.js";
import { NetworkStorage } from "./storage/NetworkStorage.js";
import "./debug.js"; //To make it execute

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
        if (error?.toString().includes("SyntaxError")) {
            window.location.href = "index.html"; //Need to log back in
        }
    }
    await game.switchRenderer(); //To enable graphics

    // Game loop
    let lastTime = performance.now();
    function gameLoop() {
        const currentTime = performance.now();
        requestAnimationFrame(gameLoop);
        document.getElementById('catchUpNotice')!.style.display = game.tick() ? "flex" : "none";
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
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && game.city) {
            game.storage.saveCity(game.player!.id, game.city);
            game.storage.updatePlayer(game.player!);
        }
    });
}

initGame();
