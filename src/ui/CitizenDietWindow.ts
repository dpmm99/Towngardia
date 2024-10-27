import { City } from "../game/City.js";
import { FoodHealth, FoodSatisfaction, FoodSufficiency } from "../game/ResourceTypes.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class CitizenDietWindow implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);

    constructor(private city: City, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const windowDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "citizenDietWindow",
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, windowDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        // Window title
        windowDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/diet")
        }));
        windowDrawable.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Citizen Diet",
            width: "200px",
            height: "32px"
        }));

        // Close button
        windowDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.shown = false
        }));

        let nextY = 90 - this.scroller.getScroll();
        const baseY = nextY;

        // Food Sufficiency bar
        this.addProgressBar(windowDrawable, nextY, "Sufficiency", this.city.resources.get(new FoodSufficiency().type)!.amount, "ui/foodsufficiency");
        nextY += 70;

        // Food Satisfaction bar
        this.addProgressBar(windowDrawable, nextY, "Gratification", this.city.resources.get(new FoodSatisfaction().type)!.amount, "ui/foodsatisfaction");
        nextY += 70;

        // Food Health bar
        this.addProgressBar(windowDrawable, nextY, "Healthiness", this.city.resources.get(new FoodHealth().type)!.amount, "ui/foodhealth");
        nextY += 90;

        // Diet Composition
        windowDrawable.addChild(new Drawable({
            x: 10,
            y: nextY,
            text: "Diet Composition and Benefits",
            width: "450px",
            height: "32px"
        }));
        nextY += 40;

        const maxFoodsToShow = this.city.peakPopulation < 1200 ? 4 : (this.city.peakPopulation < 1800 ? 6 : this.city.citizenDietSystem.lastDietComposition.length);
        for (let i = 0; i < maxFoodsToShow; i++) {
            const food = this.city.citizenDietSystem.lastDietComposition[i];
            if (!food) break;

            this.addFoodItem(windowDrawable, nextY, food);
            nextY += 60;
        }

        this.scroller.setChildrenSize(nextY - baseY + 20);

        this.lastDrawable = windowDrawable;
        return windowDrawable;
    }

    //TODO: Would be cooler if vertical along the sides of the screen, but...eh.
    private addProgressBar(parent: Drawable, y: number, label: string, value: number, iconPath: string): void {
        parent.addChild(new Drawable({
            x: 10,
            y: y,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, iconPath)
        }));

        parent.addChild(new Drawable({
            x: 68,
            y: y + 8,
            text: label,
            width: "150px",
            height: "32px"
        }));

        parent.addChild(new Drawable({
            x: 228,
            y: y + 14,
            width: "250px",
            noXStretch: false,
            height: "20px",
            fallbackColor: '#666666',
            image: new TextureInfo(200, 20, "ui/progressbg"),
            children: [
                new Drawable({
                    x: 0,
                    y: 0,
                    width: "250px",
                    noXStretch: false,
                    height: "20px",
                    fallbackColor: '#00ff11',
                    clipWidth: 0.03 + value * 0.94,
                    image: new TextureInfo(200, 20, "ui/progressfg"),
                })
            ],
        }));
    }

    private addFoodItem(parent: Drawable, y: number, food: { type: string, ratio: number, effectiveness: number }): void {
        parent.addChild(new Drawable({
            x: 10,
            y: y,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `resource/${food.type}`)
        }));

        parent.addChild(new Drawable({
            x: 68,
            y: y + 8,
            text: food.type, //TODO: pretty name
            width: "150px",
            height: "32px"
        }));

        parent.addChild(new Drawable({
            x: 228,
            y: y + 8,
            text: `${(food.ratio * 100).toFixed(1)}%`,
            width: "80px",
            height: "32px",
        }));

        parent.addChild(new Drawable({
            x: 328,
            y: y + 14,
            width: "150px",
            noXStretch: false,
            height: "20px",
            fallbackColor: '#666666',
            image: new TextureInfo(100, 20, "ui/progressbg"),
            children: [
                new Drawable({
                    x: 0,
                    y: 0,
                    width: "150px",
                    noXStretch: false,
                    height: "20px",
                    fallbackColor: '#00ff11',
                    clipWidth: 0.03 + food.effectiveness * 0.94,
                    image: new TextureInfo(100, 20, "ui/progressfg"),
                })
            ],
        }));
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public show() {
        this.scroller.resetScroll();
        this.shown = true;
    }

    isShown(): boolean {
        return this.shown;
    }
}