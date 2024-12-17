import { Assist } from "../game/Assist.js";
import { City } from "../game/City.js";
import { DietReward, HappinessReward, ProductionReward, ResearchReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { GameState } from "../game/GameState.js";
import { BrainBrews, Chocolate, GIFT_TYPES, GleeGrenades, TurboTonics, getResourceType } from "../game/ResourceTypes.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { UIManager } from "./UIManager.js";
import { addResourceCosts } from "./UIUtil.js";

export class FriendGiftWindow implements IHasDrawable {
    private lastDrawable: Drawable | null = null;
    public shown: boolean = false;
    private sending: boolean = false;

    // Track selected amounts for each gift resource type
    private resourceAmounts: Map<string, number> = new Map();

    constructor(private city: City, private friendCity: City, private uiManager: UIManager, private game: GameState) {
        // Initialize resource amounts to 0
        GIFT_TYPES.forEach(resourceType => {
            if (city.resources.get(resourceType)?.capacity) this.resourceAmounts.set(resourceType, 0);
        });
    }

    private changeResourceAmount(resourceType: string, change: number): void {
        if (this.sending) return;
        const selectedAmount = this.resourceAmounts.get(resourceType) || 0;
        const resource = this.city.resources.get(resourceType)!;
        const newAmount = Math.max(0, Math.min(Math.floor(resource.amount), selectedAmount + change));
        this.resourceAmounts.set(resourceType, newAmount);
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const window = new Drawable({
            anchors: ['centerX'],
            y: 200,
            centerOnOwnX: true,
            width: "520px", //Widen for more gift options. 160x3 + 10x4 for 3 options.
            height: "338px", //Exact spacing regardless of number of options.
            fallbackColor: "#333333",
            onClick: () => { }, // Prevent clicks from closing the window in case you just missed one of the buttons, because you might have tapped 90 times to set your amount of gifts to give :)
        });

        let nextY = 10;
        window.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "32px",
            text: "Select Gifts to Send",
        }));
        nextY += 40;

        // Resource selection for each gift resource type
        let nextX = 10;
        [...this.resourceAmounts.keys()].forEach(resourceType => {
            const resource = this.city.resources.get(resourceType)!;
            const selectorWidth = 160;
            const selector = window.addChild(new Drawable({
                x: nextX,
                y: nextY,
                width: selectorWidth + "px",
                height: "220px",
                fallbackColor: '#111111',
            }));

            // Resource icon/amount
            let nextRY = addResourceCosts(selector, [resource], selectorWidth / 2 - 32, 10, false, false, false, 64, 10, 32);

            // Resource name
            selector.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: nextRY,
                width: "calc(100% - 10px)",
                height: "32px",
                text: resource.displayName,
            }));
            nextRY += 40;

            // Decrease button
            if ((this.resourceAmounts.get(resourceType) || 0) > 0)
                selector.addChild(new Drawable({
                    x: 10,
                    y: nextRY,
                    width: "48px",
                    height: "48px",
                    fallbackColor: '#444444',
                    onClick: () => this.changeResourceAmount(resourceType, -1),
                    children: [
                        new Drawable({
                            anchors: ['centerX'],
                            centerOnOwnX: true,
                            y: 9,
                            width: "32px",
                            height: "38px",
                            text: "-",
                        })
                    ]
                }));

            // Selected amount
            selector.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: nextRY + 9,
                width: "calc(100% - 116px)",
                height: "38px",
                text: `${this.resourceAmounts.get(resourceType) || 0}`,
            }));

            // Increase button
            if ((this.resourceAmounts.get(resourceType) || 0) < Math.floor(resource.amount))
                selector.addChild(new Drawable({
                    anchors: ['right'],
                    x: 10,
                    y: nextRY,
                    width: "48px",
                    height: "48px",
                    fallbackColor: '#444444',
                    onClick: () => this.changeResourceAmount(resourceType, 1),
                    children: [
                        new Drawable({
                            anchors: ['centerX'],
                            centerOnOwnX: true,
                            y: 9,
                            width: "32px",
                            height: "38px",
                            text: "+",
                        })
                    ]
                }));

            nextX += selectorWidth + 10;
        });
        nextY += 230;

        // Give button
        window.addChild(new Drawable({
            anchors: ['right', 'bottom'],
            x: 10,
            y: 10,
            width: "120px",
            height: "48px",
            fallbackColor: this.sending ? '#333333' : '#335533',
            onClick: () => this.giveResources(),
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    centerOnOwnX: true,
                    y: 11,
                    width: "100%",
                    height: "38px",
                    text: this.sending ? "Sending..." : "Give",
                })
            ]
        }));

        return this.lastDrawable = window;
    }

    private async giveResources() {
        if (this.sending) return;
        this.sending = true;
        const brainBrews = this.resourceAmounts.get(getResourceType(BrainBrews))!;
        if (brainBrews) await this.sendAssist(getResourceType(BrainBrews),new ResearchReward(5 * LONG_TICKS_PER_DAY, 0.1 * brainBrews));

        const gleeGrenades = this.resourceAmounts.get(getResourceType(GleeGrenades))!;
        if (gleeGrenades) await this.sendAssist(getResourceType(GleeGrenades), new HappinessReward(5 * LONG_TICKS_PER_DAY, 0.01 * gleeGrenades));

        const turboTonics = this.resourceAmounts.get(getResourceType(TurboTonics))!;
        if (turboTonics) await this.sendAssist(getResourceType(TurboTonics), new ProductionReward(5 * LONG_TICKS_PER_DAY, 0.05 * turboTonics));

        const chocolate = this.resourceAmounts.get(getResourceType(Chocolate))!;
        if (chocolate) await this.sendAssist(getResourceType(Chocolate), new DietReward(5 * LONG_TICKS_PER_DAY, 0.03 * chocolate));

        this.sending = false;
        this.hide();
        this.uiManager.frameRequested = true;
    }

    private async sendAssist(type: string, event: ResearchReward | HappinessReward | ProductionReward) {
        try {
            await this.game.sendAssist(new Assist(this.friendCity.id, event, Date.now(), this.friendCity.player.id.toString()));
            this.city.checkAndSpendResources([{ type, amount: this.resourceAmounts.get(type)! }]);
            this.resourceAmounts.set(type, 0);
        } catch {
            //Couldn't send the winnings to the other player.
            if (confirm("Failed to send your assistance to the other player. This is expected if you just got prompted to log in again. Press OK to try again once you've confirmed that you're connected and logged in...or press cancel to be greedy. :)")) {
                this.sendAssist(type, event);
            }
        }
    }

    public hide() {
        if (this.sending) return;
        this.shown = false;
    }

    public isShown(): boolean {
        return this.shown;
    }

    public show(): void {
        this.shown = true;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}