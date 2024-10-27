import { BIGGER_MOBILE_RATIO, INVERSE_BIGGER_MOBILE_RATIO } from "../rendering/RenderUtil.js";

//Either X or Y scroll when dragging, not both. Use in the Drawable.onDrag event like: this.categoryScroller.handleDrag(x or y depending on yScroll, this.getLastDrawable().screenArea);.
export class StandardScroller {
    private scroll: number = 0;
    private lastSize: number = 0;
    private maxScroll: number = 0;
    private lastTouch: number = -99999;
    private dpr: number;
    private inverseDpr: number;

    constructor(biggerOnMobile: boolean, private yScroll: boolean) {
        this.dpr = biggerOnMobile ? INVERSE_BIGGER_MOBILE_RATIO : 1;
        this.inverseDpr = biggerOnMobile ? BIGGER_MOBILE_RATIO : 1;
    }

    handleDrag(touchPosOnAxis: number, screenArea: number[]): void {
        if (this.lastTouch === -99999) {
            this.lastTouch = touchPosOnAxis;
            //Don't let them scroll to the left/top (past the end of the list)
            const visibleSpan = (this.yScroll ? (screenArea[3] - screenArea[1]) : (screenArea[2] - screenArea[0])) * this.dpr;
            this.maxScroll = Math.max(0, this.lastSize - visibleSpan) * this.inverseDpr;
            return;
        } else if (this.lastTouch < -99999) {
            this.lastTouch = touchPosOnAxis;
            return;
        }

        const delta = (touchPosOnAxis - this.lastTouch) * this.dpr;
        this.scroll = Math.max(0, Math.min(this.maxScroll * this.dpr, this.scroll - delta));
        this.lastTouch = touchPosOnAxis;
    }

    resetDrag(): void { //Needs called on either touch-end or touch-start
        if (this.lastTouch !== -99999) this.lastTouch = -100000; //Do NOT set to -99999, because that'll break maxScroll until setChildrenSize gets called with a different size (if toggling fullscreen or resizing the window or changing the children).
    }

    onResize() {
        this.lastTouch = -99999; //Reset so it calculates on the next touch (because we don't know the screen coordinates when this is called)
    }

    resetScroll(): void {
        this.scroll = 0;
    }

    getScroll(): number {
        return this.scroll;
    }

    setScroll(scroll: number): void {
        this.scroll = scroll; //Use sparingly...it doesn't check bounds.
    }

    setChildrenSize(size: number): void {
        if (size === this.lastSize) return; //To avoid skipping events unnecessarily--the width likely isn't changing due to scrolling, but the Drawables get rebuilt
        this.lastTouch = -99999; //Reset so it calculates on the next touch (because we don't know the screen coordinates when this is called)
        this.lastSize = this.maxScroll = size;
    }
}