import { Building } from "../game/Building.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { addResourceCosts, humanizePowerCeil, humanizePowerFloor } from "./UIUtil.js";

export class BuildTypeBar implements IHasDrawable, IOnResizeEvent {
    //Main bar (shouldn't be here, really)
    public expandedCategory: BuildingCategory | null = null;
    private barHeight = 80;

    //Building list (within one category) bar
    public selectedBuilding: Building | null = null;
    private expandedCategoryHeight = 120;
    private buildingIconSize = 48;
    private buildingPadding = 10;
    private extraTextWidth = 32;
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(true, false);
    private lastCategoryScrollValue: number = 0;
    private lastCategory: BuildingCategory | null = null; //For remembering the scroll position when you select a building

    constructor(private city: City, private uiManager: UIManager) {
    }

    onResize(): void { this.scroller.onResize(); }

    handleClick(x: number, y: number): boolean {
        const clicked = this.lastDrawable?.getClickedDescendant(x, y); //also checks that onClick is set
        if (!clicked) return false;
        clicked.onClick!();
        return true;
    }

    resetScroll() {
        this.scroller.resetScroll();
    }

    selectBuildingType(name: string, toggle: boolean = false): void {
        if (this.expandedCategory === null) {
            this.selectedBuilding = null;
            this.scroller.resetScroll();
            return;
        }
        const buildingTypes = this.city.buildingTypesByCategory.get(this.expandedCategory!) || [];
        const clickedBuilding = buildingTypes.find(bt => (!bt.locked || this.city.hasUnplacedBuilding(bt)) && bt.type === name) ?? null;
        this.selectedBuilding = toggle && this.selectedBuilding === clickedBuilding ? null : clickedBuilding;
        if (this.selectedBuilding) { //Remember the category's scroll level so if you back out of it, it returs you to the same spot
            this.lastCategoryScrollValue = this.scroller.getScroll();
            this.lastCategory = this.expandedCategory;
            this.scroller.resetScroll();
        } else if (this.expandedCategory === this.lastCategory) {
            this.scroller.setScroll(this.lastCategoryScrollValue);
        } else this.scroller.resetScroll();
    }

    asDrawable(): Drawable {
        if (this.expandedCategory === null) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing
        return this.lastDrawable = this.createExpandedCategoryDrawable();
    }

    getLastDrawable(): Drawable | null { return this.lastDrawable; }

    private createExpandedCategoryDrawable(): Drawable {
        const expandedDrawable = new Drawable({
            x: 0,
            y: this.barHeight,
            anchors: ['bottom'],
            width: "100%",
            height: this.expandedCategoryHeight + "px",
            fallbackColor: '#444444',
            id: "expandedCategory",
            biggerOnMobile: true, scaleYOnMobile: true,
            onClick: () => {
                //To capture clicks so they don't go through to the city, but also to deselect the building if you click anywhere in the bar with a building selected
                if (this.selectedBuilding) this.selectBuildingType(this.selectedBuilding.type, true);
            },
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(x, expandedDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); }
        });

        //Upon selection, switch to showing just that building type and its resources (but much bigger, beside it instead of below it)
        if (this.selectedBuilding?.isHidden) this.selectedBuilding = null; //Stop showing buildings if they're hidden (e.g., seasonal buildings, if the player's looking when the season event ends)
        if (this.selectedBuilding) return this.drawJustSelectedBuilding(expandedDrawable);
        
        const buildingTypes = this.city.buildingTypesByCategory.get(this.expandedCategory!) || [];
        const unlockedBuildingTypes = buildingTypes.filter(bt => !bt.locked || this.city.hasUnplacedBuilding(bt));

        const itemWidth = this.buildingIconSize + 2 * this.buildingPadding + this.extraTextWidth;
        let x = this.buildingPadding + this.extraTextWidth / 2 - this.scroller.getScroll();
        const baseX = x;
        unlockedBuildingTypes.forEach((buildingType) => {
            if (buildingType.isHidden || (!buildingType.isBuyable(this.city) && !this.city.hasUnplacedBuilding(buildingType))) return; //Don't show things in the list if they can't be bought and aren't in stock

            const grayscale = !buildingType.isPlaceable(this.city);
            const reddize = grayscale || !this.city.canAffordBuilding(buildingType); //Including grayscale is a short-circuit for performance

            //Include a mock drawable to make the whole area clickable and not just the building icon and name
            expandedDrawable.addChild(new Drawable({
                x: x - this.extraTextWidth / 2 - this.buildingPadding,
                y: 0,
                width: itemWidth + "px",
                height: this.expandedCategoryHeight + "px",
                fallbackColor: "#00000000",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                onClick: () => this.selectBuildingType(buildingType.type, true),
                onLongTap: () => this.uiManager.showBuildingInfo(buildingType),
            }));

            //Building icon
            const buildingIconDrawable = expandedDrawable.addChild(new Drawable({
                x: x + this.buildingIconSize / 2,
                y: this.buildingPadding,
                centerOnOwnX: true,
                width: this.buildingIconSize + "px",
                height: this.buildingIconSize + "px",
                image: new TextureInfo(this.buildingIconSize, this.buildingIconSize, "building/" + buildingType.type),
                id: expandedDrawable.id + "." + buildingType.id,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                grayscale: grayscale,
            }));

            //If we have any unplaced copies of the building, put that number at the top-right of the building icon
            const countInStock = this.city.getUnplacedBuildingCount(buildingType);
            if (countInStock > 0) {
                const circle = buildingIconDrawable.addChild(new Drawable({
                    anchors: ['right'],
                    x: -10,
                    y: -10,
                    width: "40px",
                    height: "40px",
                    rightAlign: true,
                    cssClasses: ['building-count'],
                    biggerOnMobile: true,
                    scaleXOnMobile: true,
                    scaleYOnMobile: true,
                    image: new TextureInfo(40, 40, "ui/resourceborder"),
                }));
                circle.addChild(new Drawable({
                    anchors: ['centerX'],
                    y: 13,
                    centerOnOwnX: true,
                    width: "40px",
                    height: "20px",
                    text: countInStock.toString(),
                    biggerOnMobile: true,
                    scaleYOnMobile: true,
                }));
            }

            if (this.city.tutorialStepIndex !== -1 && (countInStock > 0 || unlockedBuildingTypes.length === 1)) {
                buildingIconDrawable.addChild(new Drawable({
                    x: -this.buildingIconSize,
                    y: -this.buildingIconSize,
                    width: this.buildingIconSize * 3 + "px",
                    height: this.buildingIconSize * 3 + "px",
                    biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    image: new TextureInfo(96, 96, "ui/majorsalience"),
                }));
            }

            // Add building name
            expandedDrawable.addChild(new Drawable({
                x: x + this.buildingIconSize / 2, //Centered on the image
                y: this.buildingPadding + this.buildingIconSize + 2,
                width: this.buildingIconSize + this.extraTextWidth + "px",
                height: "20px",
                text: buildingType.displayName,
                cssClasses: ['building-name'],
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                centerOnOwnX: true,
                grayscale: grayscale,
            }));

            // Add resource costs
            const costs = buildingType.getCosts(this.city);
            const costsX = x + this.buildingIconSize / 2 - costs.length * 8 - (costs.length - 1); //Centered on the image
            addResourceCosts(expandedDrawable, costs, costsX, this.buildingPadding + this.buildingIconSize + 24, true, true, true, 16, 2, 14, 4, grayscale, reddize, this.city);
            x += itemWidth;
        });

        if (x === baseX) {
            expandedDrawable.addChild(new Drawable({
                x: 10,
                y: 10,
                width: "100%",
                height: "32px",
                text: "Category: " + BuildingCategory[this.expandedCategory!].toLowerCase().replace(/(_|^)([a-z])/g, (v) => " " + v.slice(-1).toUpperCase()).trim(), //Title-case like "NATURAL_BLOCKERS" -> "Natural Blockers"
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            expandedDrawable.addChild(new Drawable({
                x: 10,
                y: 50,
                width: "100%",
                height: "24px",
                text: "Nothing to see here yet!",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            expandedDrawable.addChild(new Drawable({
                x: 10,
                y: 80,
                width: "100%",
                height: "24px",
                text: "You'll unlock buildings in this category later.",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
        }

        this.scroller.setChildrenSize(x - baseX + this.extraTextWidth / 2);

        return this.lastDrawable = expandedDrawable;
    }

    private drawJustSelectedBuilding(expandedDrawable: Drawable): Drawable {
        const building = this.selectedBuilding!;
        let nextX = this.buildingPadding - this.scroller.getScroll();
        const baseX = nextX;
        const grayscale = !building.isPlaceable(this.city);
        const reddize = grayscale || !this.city.canAffordBuilding(building); //Including grayscale is a short-circuit for performance
        expandedDrawable.addChild(new Drawable({
            x: nextX,
            y: this.buildingPadding,
            width: (this.expandedCategoryHeight - this.buildingPadding * 2) + "px",
            height: (this.expandedCategoryHeight - this.buildingPadding * 2) + "px",
            image: new TextureInfo(this.buildingIconSize, this.buildingIconSize, "building/" + building.type),
            id: expandedDrawable.id + "." + building.id,
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            onClick: () => this.selectBuildingType(building.type, true),
            onLongTap: () => this.uiManager.showBuildingInfo(building),
            grayscale: grayscale,
        }));
        nextX += this.expandedCategoryHeight - this.buildingPadding;

        // Add building name
        expandedDrawable.addChild(new Drawable({
            x: nextX,
            y: this.buildingPadding,
            width: this.expandedCategoryHeight + this.extraTextWidth * 2 + "px",
            height: "32px",
            text: building.displayName,
            cssClasses: ['building-name'],
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            grayscale: grayscale,
        }));
        //Add resource costs beneath that
        const costs = building.getCosts(this.city);
        nextX = Math.max(nextX + this.expandedCategoryHeight + this.extraTextWidth * 2 + this.buildingPadding * 2, addResourceCosts(expandedDrawable, costs, nextX, this.buildingPadding + 32, true, true, true, 32, 10, 32, 8, grayscale, reddize, this.city));

        //Show the "rolling purchase limit" for each resource as well
        if (costs.some(p => p.type !== 'flunds')) {
            expandedDrawable.addChild(new Drawable({
                x: nextX,
                y: this.buildingPadding,
                width: "200px",
                height: "32px",
                text: "For sale:",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));

            const buyable = costs.filter(p => p.type !== 'flunds').map(cost => ({ type: cost.type, amount: this.city.resources.get(cost.type)!.buyableAmount }));
            nextX = Math.max(nextX + 200 + this.buildingPadding, addResourceCosts(expandedDrawable, buyable, nextX, this.buildingPadding + 32, true, true, true, 32, 10, 32, 8));
        }

        //Show building power usage, current power surplus, and importable power
        const powerUsage = building.getPowerUpkeep(this.city, true);
        if (powerUsage) {
            const powerSurplus = this.city.resources.get('power')!.productionRate - this.city.resources.get('power')!.consumptionRate;
            expandedDrawable.addChild(new Drawable({
                x: nextX,
                y: this.buildingPadding,
                width: "250px",
                height: "32px",
                text: "Power usage: " + humanizePowerCeil(powerUsage),
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            expandedDrawable.addChild(new Drawable({
                x: nextX,
                y: this.buildingPadding + 32,
                width: "250px",
                height: "32px",
                text: (powerSurplus >= 0 ? "City surplus: " : "City deficit: ") + humanizePowerFloor(Math.abs(powerSurplus)),
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            expandedDrawable.addChild(new Drawable({
                x: nextX,
                y: this.buildingPadding + 64,
                width: "250px",
                height: "32px",
                text: "Importable: " + humanizePowerFloor(this.city.desiredPower * 0.5 + Math.min(0, powerSurplus)), //positive powerSurplus doesn't affect this calculation
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            nextX += 250 + this.buildingPadding * 2; //Was a bit too close to the right edge of the screen without the * 2
        }

        this.scroller.setChildrenSize(nextX - baseX);
        return this.lastDrawable = expandedDrawable;
    }
}
