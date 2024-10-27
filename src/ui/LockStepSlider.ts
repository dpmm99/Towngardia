import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class LockStepSlider extends Drawable {
    private readonly barWidth: number = 300;
    private readonly handleWidth: number = 32;
    private bar!: Drawable; //set in constructor
    private handle!: Drawable;
    private valueLabel!: Drawable;
    constructor(
        private uiManager: UIManager,
        base: Partial<Drawable> = {},
        private label: string,
        private iconId: string,
        private options: string[],
        public currentIndex: number = 0,
        private onChange: (value: string) => void
    ) {
        super(base);
        this.width = "0px"; //The control as a whole doesn't need drawn
        this.createSliderComponents();
        this.setIndex(currentIndex);
    }

    private createSliderComponents() {
        const padding = 20;
        // Icon
        let nextX = 0;
        if (this.iconId !== "") {
            this.addChild(new Drawable({
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, this.iconId),
                fallbackColor: '#ff00ff',
            }));
            nextX += 64 + padding;
        }

        // Label
        this.addChild(new Drawable({
            x: nextX,
            y: 20,
            text: this.label,
            width: "100px",
            height: "24px"
        }));
        nextX += 100 + padding;

        // Slider bar
        this.addChild(this.bar = new Drawable({
            x: nextX,
            y: 16,
            width: this.barWidth + "px",
            height: "32px",
            fallbackColor: "#CCCCCC",
            onClick: () => { },
            onDrag: (x: number) => this.updateSliderPosition(x - this.bar.screenArea[0], this.bar.screenArea[2] - this.bar.screenArea[0]),
            children: [this.handle = new Drawable({
                x: 0,
                y: -8,
                width: this.handleWidth + "px",
                height: "48px",
                fallbackColor: "#00CC00",
                image: new TextureInfo(this.handleWidth, 48, "ui/sliderhandle"),
            })]
        }));
        nextX += this.barWidth + padding;

        // Value display
        this.addChild(this.valueLabel = new Drawable({
            x: nextX,
            y: 20,
            text: this.options[this.currentIndex],
            width: "50px",
            height: "24px"
        }));
    }

    private setIndex(newIndex: number) {
        this.currentIndex = newIndex;
        this.handle.x = this.currentIndex / (this.options.length - 1) * (this.barWidth - this.handleWidth); // Update handle position
        this.valueLabel.text = this.options[this.currentIndex]; // Update value display
        this.onChange(this.options[this.currentIndex]);
    }

    private updateSliderPosition(x: number, displayWidth: number) {
        if (!this.uiManager.isMyCity) return;
        const newIndex = Math.min(Math.max(Math.round(x * (this.options.length - 1) / displayWidth), 0), this.options.length - 1); //this.options.length must be at least 2--duh, don't use a slider with 0 options
        if (newIndex !== this.currentIndex) {
            this.setIndex(newIndex);
        }
    }

    public setValue(value: string): void {
        this.setIndex(Math.max(0, this.options.findIndex(option => option === value)));
    }

    public getValue(): string {
        return this.options[this.currentIndex];
    }
}