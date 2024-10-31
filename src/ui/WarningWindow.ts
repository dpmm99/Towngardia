import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { TextureInfo } from "./TextureInfo.js";

export class WarningWindow implements IHasDrawable {
    private lastDrawable: Drawable | null = null;
    constructor(public text: string | null = null) {
    }

    asDrawable(): Drawable {
        if (!this.text) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const window = new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            width: "500px",
            height: "110px",
            fallbackColor: "#333333",
            biggerOnMobile: true,
            onClick: () => this.text = null,
        });

        window.addChild(new Drawable({
            x: -5,
            y: -3,
            width: "48px",
            height: "48px",
            image: new TextureInfo(64, 64, "ui/warningbackdrop"),
            biggerOnMobile: true,
            scaleXOnMobile: true,
            scaleYOnMobile: true,
        }));

        //The text to the right of that.
        window.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "calc(100% - 20px)",
            height: "32px",
            text: "\u200B\u00A0    " + this.text, //The only way to word wrap around the warning icon. :)
            wordWrap: true,
            biggerOnMobile: true,
            scaleXOnMobile: true,
            scaleYOnMobile: true,
        }));

        return window;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}