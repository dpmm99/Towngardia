import { Resource } from "../game/Resource.js";
import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";

export class ResourceSlider extends Drawable {
    private sliderWidth: number = 250;
    private sliderHeight: number = 48;
    private handleWidth: number = 32;
    private handleHeight: number = 48;
    private barHeight: number = 32;
    private autoBuyHandle: Drawable | undefined;
    private autoSellHandle: Drawable | undefined;

    constructor(options: Partial<Drawable> = {}, private resource: Resource, private locked: boolean, private lastTouched: { resourceType: string, side: "buy" | "sell" }) {
        super(options);
        this.width = `${this.sliderWidth}px`;
        this.height = `${this.sliderHeight}px`;
        this.fallbackColor = '#00000000';
        this.onClick = () => { }; //Doesn't need to do anything, but does need to be "clickable" for the sake of the sliders, so they know the bar area. Would be more complex if placed on the gray/red/green segments since their widths can be 0 (and therefore screenArea wouldn't be set).
        this.createSliderComponents();
    }

    private createSliderComponents() {
        const barY = (this.handleHeight - this.barHeight) / 2;
        const autoBuyLevel = this.getHandlePosition(this.resource.autoBuyBelow);
        const autoSellLevel = this.getHandlePosition(this.resource.autoSellAbove);

        // Main slider bar: all gray
        this.addChild(new Drawable({
            width: (autoSellLevel - autoBuyLevel) + 'px',
            height: `${this.barHeight}px`,
            x: autoBuyLevel,
            y: barY,
            fallbackColor: '#CCCCCC',
            scaleYOnMobile: true,
        }));

        // Auto-buy segment
        if (this.resource.buyPrice > 0) //No longer shown for non-purchaseable resources
            this.addChild(new Drawable({
                width: autoBuyLevel + 'px',
                height: `${this.barHeight}px`,
                x: 0,
                y: barY,
                fallbackColor: '#DD5555',
                scaleYOnMobile: true,
            }));

        // Auto-sell segment
        if (this.resource.sellPrice > 0) //No longer shown for non-sellable resources (of which there are none currently)
            this.addChild(new Drawable({
                width: (this.sliderWidth - autoSellLevel) + 'px',
                height: `${this.barHeight}px`,
                x: autoSellLevel,
                y: barY,
                fallbackColor: '#44BB44',
                scaleYOnMobile: true,
            }));

        // Auto-buy handle
        if (this.resource.buyPrice > 0) //No longer shown for non-purchaseable resources
            this.addChild(this.autoBuyHandle = new Drawable({
                width: `${this.handleWidth}px`,
                height: `${this.handleHeight}px`,
                image: new TextureInfo(this.handleWidth, this.handleHeight, 'ui/autobuyhandle'),
                fallbackColor: '#00FF00',
                x: autoBuyLevel - 21,
                y: 0,
                onClick: () => { this.lastTouched.resourceType = this.resource.type; this.lastTouched.side = "buy"; }, //Just needs to exist
                onDrag: (x: number, y: number) => {
                    if (this.locked) return;
                    this.lastTouched.resourceType = this.resource.type; this.lastTouched.side = "buy";
                    this.resource.autoBuyBelow = this.getTargetLevel(x, y);
                    if (this.resource.autoBuyBelow > this.resource.autoSellAbove) this.resource.autoSellAbove = this.resource.autoBuyBelow;
                    this.updateHandlePositions();
                },
                biggerOnMobile: true,
            }));

        // Auto-sell handle
        if (this.resource.sellPrice > 0) //No longer shown for non-sellable resources (of which there are none currently)
            this.addChild(this.autoSellHandle = new Drawable({
                width: `${this.handleWidth}px`,
                height: `${this.handleHeight}px`,
                image: new TextureInfo(this.handleWidth, this.handleHeight, 'ui/autosellhandle'),
                fallbackColor: '#FF0000',
                x: autoSellLevel - 12,
                y: 0,
                onClick: () => { this.lastTouched.resourceType = this.resource.type; this.lastTouched.side = "sell"; }, //Just needs to exist
                onDrag: (x: number, y: number) => {
                    if (this.locked) return;
                    this.lastTouched.resourceType = this.resource.type; this.lastTouched.side = "sell";
                    this.resource.autoSellAbove = this.getTargetLevel(x, y);
                    if (this.resource.autoSellAbove < this.resource.autoBuyBelow) this.resource.autoBuyBelow = this.resource.autoSellAbove;
                    this.updateHandlePositions();
                },
                biggerOnMobile: true,
            }));
    }

    private getHandlePosition(level: number): number {
        return level * this.sliderWidth;
    }

    private getTargetLevel(x: number, y: number): number {
        const yFromBar = Math.abs(y - (this.screenArea[1] + this.screenArea[3]) / 2);
        const newValue = yFromBar <= this.barHeight * 6 ? (x - this.screenArea[0]) / this.sliderWidth : x / this.screenArea[2];
        return Math.max(0, Math.min(1, newValue));
    }

    updateLevels(autoBuyLevel: number, autoSellLevel: number) {
        if (this.autoBuyHandle) this.resource.autoBuyBelow = Math.max(0, Math.min(autoSellLevel, autoBuyLevel));
        if (this.autoSellHandle) this.resource.autoSellAbove = Math.min(1, Math.max(autoBuyLevel, autoSellLevel));
        this.updateHandlePositions();
    }

    private updateHandlePositions() {
        if (this.autoBuyHandle) this.autoBuyHandle.x = this.getHandlePosition(this.resource.autoBuyBelow) - 34;
        if (this.autoSellHandle) this.autoSellHandle.x = this.getHandlePosition(this.resource.autoSellAbove) - 20;
    }
}
