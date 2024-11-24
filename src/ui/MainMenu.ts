import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { NetworkStorage } from "../storage/NetworkStorage.js";
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
            y: 200,
            centerOnOwnX: true,
            width: "300px",
            height: "600px",
            fallbackColor: "#333333",
        });

        let nextY = -30;
        menu.addChild(new Drawable({
            anchors: ['centerX'],
            y: nextY += 50,
            centerOnOwnX: true,
            width: "calc(100% - 20px)",
            height: "40px",
            text: "Fullscreen",
            onClick: () => this.uiManager.enterFullscreen(),
        }));

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

        if (this.uiManager.isMyCity) { //I visited a friend city, went to the main menu, hit View Tutorials, and lost my friend button. This should fix that! ;)
            menu.addChild(new Drawable({
                anchors: ['centerX'],
                y: nextY += 50,
                centerOnOwnX: true,
                width: "calc(100% - 20px)",
                height: "40px",
                text: "View tutorials",
                onClick: () => { this.uiManager.showTutorials(); this.shown = false; },
            }));
        }

        menu.addChild(new Drawable({
            anchors: ['centerX'],
            y: nextY += 50,
            centerOnOwnX: true,
            width: "calc(100% - 20px)",
            height: "40px",
            text: (this.uiManager.drawFPS ? "Hide" : "Show") + " theoretical FPS",
            onClick: () => this.uiManager.drawFPS = !this.uiManager.drawFPS,
        }));

        if (this.uiManager.isMyCity) {
            menu.addChild(new Drawable({
                anchors: ['centerX'],
                y: nextY += 50,
                centerOnOwnX: true,
                width: "calc(100% - 20px)",
                height: "40px",
                text: "Save city",
                onClick: () => {
                    this.shown = false;
                    this.game.fullSave();
                }
            }));
        } else {
            menu.addChild(new Drawable({
                anchors: ['centerX'],
                y: nextY += 50,
                centerOnOwnX: true,
                width: "calc(100% - 20px)",
                height: "40px",
                text: "Return to your city",
                onClick: () => {
                    this.shown = false;
                    this.uiManager.switchCity(this.game.city!, this.game.player!);
                }
            }));
        }

        menu.addChild(new Drawable({
            anchors: ['centerX'],
            y: nextY += 50,
            centerOnOwnX: true,
            width: "calc(100% - 20px)",
            height: "40px",
            text: "Reload city",
            onClick: () => {
                this.shown = false;
                this.uiManager.switchCity((this.game.visitingCity || this.game.city!).id, (this.game.visitingCity || this.game.city!).player);
            }
        }));

        menu.addChild(new Drawable({
            anchors: ['centerX'],
            y: nextY += 50,
            centerOnOwnX: true,
            width: "calc(100% - 20px)",
            height: "40px",
            text: "Save on hide: " + (this.game.saveWhenHiding ? "On" : "Off"),
            onClick: () => this.game.saveWhenHiding = !this.game.saveWhenHiding
        }));

        if (this.game.storage instanceof NetworkStorage) {
            menu.addChild(new Drawable({
                anchors: ['centerX'],
                y: nextY += 50,
                centerOnOwnX: true,
                width: "calc(100% - 20px)",
                height: "40px",
                text: "Log out",
                onClick: () => {
                    (this.game.storage as NetworkStorage).logOut();
                }
            }));
        }

        return this.lastDrawable = menu;
    }
    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}