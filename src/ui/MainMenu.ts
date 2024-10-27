import { GameState } from "../game/GameState.js";
import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { UIManager } from "./UIManager.js";

export class MainMenu implements IHasDrawable {
    private lastDrawable: Drawable | null = null;
    constructor(private game: GameState, private uiManager: UIManager, public shown: boolean = false) {

    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const menu = new Drawable({
            anchors: ['centerX'],
            x: -100,
            y: 200,
            width: "200px",
            height: "600px",
            fallbackColor: "#333333",
        });

        let nextY = 20;
        menu.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "180px",
            height: "40px",
            text: "Fullscreen",
            onClick: () => this.uiManager.enterFullscreen(),
        })); //TODO: Instead of putting the text on the above, we want that to be a button image and contain the text in a separate element
        nextY += 50;

        //Removed as I have quit maintaining the WebGL renderer and quit maintaining the HTML renderer long ago.
//        menu.addChild(new Drawable({
//            x: 10,
//            y: nextY,
//            width: "180px",
//            height: "40px",
//            text: "Switch renderer to " + (this.game.renderer instanceof CanvasRenderer ? "WebGL" : "Canvas2D"),
//            onClick: () => this.game.switchRenderer(),
//        }));
//        nextY += 50;

        menu.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "180px",
            height: "40px",
            text: "View tutorials",
            onClick: () => this.uiManager.showTutorials(),
        }));
        nextY += 50;

        menu.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "180px",
            height: "40px",
            text: (this.uiManager.drawFPS ? "Hide" : "Show") + " theoretical FPS",
            onClick: () => this.uiManager.drawFPS = !this.uiManager.drawFPS,
        }));
        nextY += 50;

        return this.lastDrawable = menu;
    }
    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}