import { Budget } from "../game/Budget.js";
import { City } from "../game/City.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { LockStepSlider } from "./LockStepSlider.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeCeil, humanizeFloor } from "./UIUtil.js";

export class BudgetMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private budget: Budget;
    private taxSliders: Record<string, LockStepSlider> = {};
    private serviceSliders: Record<string, LockStepSlider> = {};
    private readonly serviceAndOtherNames: Record<string, string> = { //for both serviceAllocations and otherExpenses
        "fireprotection": "Firefighting",
        "policeprotection": "Police",
        "healthcare": "Healthcare",
        "education": "Education",
        "environment": "Environment",
        "infrastructure": "Infrastructure",
        "powerprod": "Power plant costs", //currently under "other expenses" but I mayyyyyy make it a service cost
        "agriculture": "Agriculture",
        "industry": "Industry",
        "resources": "Resource import costs"
    };

    constructor(private city: City, private uiManager: UIManager) {
        this.budget = city.budget; // Assuming the city has a budget property

        //Build the sliders once and reuse them
        this.taxSliders = {
            income: new LockStepSlider(uiManager, { x: 20, y: 0, fallbackColor: "#00000000" }, "Income Tax", "ui/incometax", ["9%", "10%", "11%"], 0, (value) => { }),
            sales: new LockStepSlider(uiManager, { x: 20, y: 0, fallbackColor: "#00000000" }, "Sales Tax", "ui/salestax", ["9%", "10%", "11%"], 0, (value) => { }),
            property: new LockStepSlider(uiManager, { x: 20, y: 0, fallbackColor: "#00000000" }, "Property Tax", "ui/propertytax", ["9%", "10%", "11%"], 0, (value) => { }),
        };
        Object.keys(this.budget.serviceAllocations).forEach((service) =>
            this.serviceSliders[service] = new LockStepSlider(uiManager, { x: 20, y: 0, fallbackColor: "#00000000" }, this.serviceAndOtherNames[service], `ui/${service}`, ["80%", "90%", "100%"], 0, (value) => { })
        );
        this.serviceSliders["power"] = new LockStepSlider(uiManager, { x: 20, y: 0, fallbackColor: "#00000000" }, "Power Import Limit", `resource/power`, ["0%", "1%", "5%", "20%", "40%", "50%"], 0, (value) => { })
    }

    onResize(): void { this.scroller.onResize(); }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const budgetDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "budgetMenu",
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, budgetDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        // Budget icon
        let nextY = 10 - this.scroller.getScroll();
        const baseY = nextY;
        budgetDrawable.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/budget")
        }));
        budgetDrawable.addChild(new Drawable({
            x: 84,
            y: nextY + 16,
            text: "Budget",
            width: "100px",
            height: "32px"
        }));

        // Close button
        budgetDrawable.addChild(new Drawable({
            x: 10,
            y: nextY,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.shown = false
        }));

        // Tax sliders
        nextY += 100;
        Object.entries(this.taxSliders).forEach((arr) => { //arr is [string, LockStepSlider]
            arr[1].y = nextY;
            budgetDrawable.addChild(arr[1]);
            nextY += 60;
            budgetDrawable.addChild(new Drawable({
                x: 102,
                y: nextY,
                text: `Latest revenue: ${humanizeFloor((this.budget.lastRevenue[arr[0]] ?? 0) * LONG_TICKS_PER_DAY)}/day`,
                width: "300px",
                height: "24px"
            }));
            nextY += 10 + 20;
        });

        // Service sliders
        let coveredCosts = 0;
        nextY += 20;
        Object.entries(this.serviceSliders).forEach(([key, slider]) => {
            slider.y = nextY;
            budgetDrawable.addChild(slider);
            nextY += 60
            budgetDrawable.addChild(new Drawable({
                x: 102,
                y: nextY,
                text: `Latest cost: ${humanizeCeil((this.budget.lastServiceCosts[key] ?? 0) * LONG_TICKS_PER_DAY)}/day`,
                width: "300px",
                height: "24px"
            }));
            coveredCosts += this.budget.lastServiceCosts[key] ?? 0;
            nextY += 10 + 20;
        });

        // Expenses not covered by the sliders
        Object.entries(this.budget.otherExpenses).forEach(([key, amount]) => {
            nextY += 10; //A little extra padding because it looks cramped--probably could use an icon for each one
            budgetDrawable.addChild(new Drawable({
                x: 10,
                y: nextY,
                text: `${this.serviceAndOtherNames[key]}: ${humanizeCeil(amount * LONG_TICKS_PER_DAY)}/day`,
                width: "300px",
                height: "24px"
            }));
            coveredCosts += amount;
            nextY += 10 + 20;
        });

        // All other expenses that I couldn't put into a category
        nextY += 10; //A little extra padding because it looks cramped--probably could use an icon for it
        budgetDrawable.addChild(new Drawable({
            x: 10,
            y: nextY,
            text: `Other expenses: ${humanizeCeil(Math.max(0, this.city.flunds.consumptionRate - coveredCosts) * LONG_TICKS_PER_DAY)}/day`,
            width: "300px",
            height: "24px"
        }));
        nextY += 10 + 20;

        this.scroller.setChildrenSize(nextY - baseY + 164 + 10);

        // Accept changes button
        if (this.uiManager.isMyCity) {
            budgetDrawable.addChild(new Drawable({
                x: 10,
                y: 10,
                anchors: ['right', 'bottom'],
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, "ui/budgetok"),
                biggerOnMobile: true,
                onClick: () => this.applyBudgetChanges()
            }));
        }

        this.lastDrawable = budgetDrawable;
        return budgetDrawable;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    private applyBudgetChanges() {
        // Apply tax changes
        Object.entries(this.taxSliders).forEach(arr => {
            this.budget.taxRates[arr[0]] = parseInt(arr[1].getValue()) / 100;
        });

        // Apply service allocation changes
        Object.entries(this.serviceSliders).forEach(arr => {
            if (arr[0] === "power") this.budget.powerImportLimit = parseInt(arr[1].getValue()) / 100;
            else this.budget.serviceAllocations[arr[0]] = parseInt(arr[1].getValue()) / 100;
        });

        // Apply the budget effects to the city
        this.budget.applyBudgetEffects(this.city);
        this.shown = false;
        this.city.updateLastUserActionTime();
        this.uiManager.game.fullSave();
    }

    public show() {
        //Reset slider visuals based on budget
        Object.entries(this.budget.taxRates).forEach(arr => {
            this.taxSliders[arr[0]].setValue((arr[1] * 100) + "%");
        });
        Object.entries(this.budget.serviceAllocations).forEach(arr => {
            this.serviceSliders[arr[0]].setValue((arr[1] * 100) + "%");
        });
        this.serviceSliders["power"].setValue((this.budget.powerImportLimit * 100) + "%");

        this.scroller.resetScroll();
        this.shown = true;
    }

    isShown(): boolean {
        return this.shown;
    }
}
