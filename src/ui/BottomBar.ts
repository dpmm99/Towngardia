import { BuildingCategory } from "../game/BuildingCategory.js";
import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class BottomBar implements IHasDrawable, IOnResizeEvent {
    public shown: boolean = true;
    public categories: BuildingCategory[] = <BuildingCategory[]>Object.values(BuildingCategory).filter(value => typeof value === 'number');
    private lastDrawable: Drawable | null = null;
    private barHeight = 80;
    private iconSize = 64;
    private padding = 10;
    private scroller = new StandardScroller(true, false);

    constructor(private city: City, private uiManager: UIManager) {
    }

    onResize(): void { this.scroller.onResize(); }

    handleClick(x: number, y: number): boolean {
        const clicked = this.lastDrawable?.getClickedDescendant(x, y); //also checks that onClick is set
        if (!clicked) return false;
        clicked.onClick!();
        return true;
    }

    selectCategory(name: string, toggle: boolean = false): void {
        const clickedCategory = this.categories.find(p => BuildingCategory[p].toString() === name) ?? null;
        this.uiManager.selectBuildCategory(clickedCategory, toggle);
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const barHeight = this.barHeight;
        const backgroundColor = '#333333'; // Dark gray

        // Create the bar Drawable with the gray background color
        const barDrawable = new Drawable({
            anchors: ['bottom'],
            width: "100%",
            height: barHeight + "px",
            fallbackColor: backgroundColor,
            id: "bottomBar",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(x, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true,
        });

        // Add a child Drawable for each category icon
        this.scroller.setChildrenSize((this.categories.length - 2) * (this.iconSize + this.padding) + this.padding); //2 natural categories subtracted
        this.categories.forEach((category, index) => {
            if (!this.city.canBuildResources && (category === BuildingCategory.BLOCKER || category === BuildingCategory.NATURAL_RESOURCE)) return; //Not the player's property
            const x = this.padding - this.scroller.getScroll() + index * (this.iconSize + this.padding);
            const categoryName = BuildingCategory[category];
            const categoryDrawable = new Drawable({
                x: x,
                y: (this.barHeight - this.iconSize) / 2, // Center vertically within the bar
                anchors: ['bottom'],
                width: this.iconSize + "px",
                height: this.iconSize + "px",
                image: new TextureInfo(this.iconSize, this.iconSize, "category/" + categoryName),
                id: barDrawable.id + "." + categoryName,
                onClick: () => this.selectCategory(categoryName, true),
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            });

            barDrawable.addChild(categoryDrawable);
        });

        this.lastDrawable = barDrawable;
        return barDrawable;
    }

    getLastDrawable(): Drawable | null { return this.lastDrawable; }

}
