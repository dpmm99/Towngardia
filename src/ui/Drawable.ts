import { BIGGER_MOBILE_RATIO, cssDimToPixels } from "../rendering/RenderUtil.js";
import { TextureInfo } from "./TextureInfo.js";

export type Anchor = 'top' | 'bottom' | 'left' | 'right' | 'below' | 'centerX' | 'selfBottom';

export class Drawable {
    children: Drawable[] = [];
    anchors: Anchor[] = [];
    image?: TextureInfo;
    fallbackImage?: TextureInfo;
    fallbackColor: string = '#FF00FF'; // Magenta by default
    width?: string; //like CSS, can be % or px (though CSS supports a whole lot more than that)
    height?: string;
    clipWidth?: number; //Width is for stretching the texture; clipWidth is a ratio of the stretched-out texture's width to actually draw; mostly for progress bars
    id?: string;
    x?: number;
    y?: number;
    biggerOnMobile?: boolean;
    scaleXOnMobile?: boolean; //Only really usable for screen coordinate drawables (including those nested in world coordinate drawables)
    scaleYOnMobile?: boolean;
    tileWidth?: number; //if it's in world dimensions; optional
    tileHeight?: number;
    grayscale: boolean = false;
    reddize: boolean = false;

    text?: string;
    rightAlign: boolean = false;
    wordWrap: boolean = false; //probably expensive. "height" is *per line* when this is true.
    noXStretch: boolean = true; //prevent stretching the text horizontally past the percentage stretch of the height (basically, width becomes *max* width)
    keepParentWidth: boolean = false; //so word-wrapped random-width text doesn't screw up nesting (used for positioning)
    centerOnOwnX: boolean = false; //basically makes the anchor relative to the center of this Drawable. For centering in the parent, set this to true, set x=0 and add 'centerX' to the anchors.
    isDiamond: boolean = false; //for drawing a city tile instead of a rectangle (but assumes you gave the rectangle dimensions)

    cssClasses: string[] = [];
    screenArea: number[] = []; // [left, top, right, bottom] in screen coordinates, set by the IRenderer
    onClick: (() => void) | null = null; //If null, it's not clickable and should ignore clicks in its area.
    onLongTap: (() => void) | null = null; //Only works if onClick is also set.
    onDrag: ((x: number, y: number) => void) | null = null;
    onDragEnd: (() => void) | null = null;

    constructor(options: Partial<Drawable> = {}) {
        Object.assign(this, options);
    }

    addChild(child: Drawable): Drawable {
        this.children.push(child);
        return child;
    }

    checkClick(x: number, y: number): boolean {
        return !!this.onClick && this.checkWithin(x, y);
    }
    checkDrag(x: number, y: number): boolean {
        return !!this.onDrag && this.checkWithin(x, y);
    }

    checkWithin(x: number, y: number): boolean {
        if (!this.screenArea.length) return false;
        const [left, top, right, bottom] = this.screenArea;
        return x >= left && x <= right && y >= top && y <= bottom;
    }

    getClickedDescendant(x: number, y: number, forDrag: boolean = false): Drawable | null { //Parents don't *contain* the children; it's just for relative positioning and relative draw order.
        for (const child of this.children.toReversed()) {
            const descendant = child.getClickedDescendant(x, y, forDrag);
            if (descendant) return descendant;
        }
        if (forDrag ? this.checkDrag(x, y) : this.checkClick(x, y)) return this;
        return null;
    }

    //Width of the image itself (or parent width if no image)
    getNaturalWidth(sprite: any, parentWidth: number) {
        return (sprite as { width: number })?.width ?? this.image?.width ?? parentWidth;
    }

    //Width of the image as it should be drawn (or parent width if no image)
    getWidth(sprite: any, parentWidth: number) {
        return (cssDimToPixels(this.width, parentWidth, this.biggerOnMobile) ?? this.getNaturalWidth(sprite, parentWidth)) * (this.biggerOnMobile && (this.width?.endsWith("px") || !this.width) ? BIGGER_MOBILE_RATIO : 1);
    }

    getNaturalHeight(sprite: any, parentHeight: number) {
        return (sprite as { height: number })?.height ?? this.image?.height ?? parentHeight;
    }

    getHeight(sprite: any, parentHeight: number) {
        return (cssDimToPixels(this.height, parentHeight, this.biggerOnMobile) ?? this.getNaturalHeight(sprite, parentHeight)) * (this.biggerOnMobile && (this.height?.endsWith("px") || !this.width) ? BIGGER_MOBILE_RATIO : 1);
    }

    getX(width: number, parentWidth: number) {
        let x = (this.x ?? 0) * (this.scaleXOnMobile ? BIGGER_MOBILE_RATIO : 1);
        return this.anchors.includes('right') ? parentWidth - width - x : x;
    }

    getY(height: number, parentHeight: number) {
        let y = (this.y ?? 0) * (this.scaleYOnMobile ? BIGGER_MOBILE_RATIO : 1);
        return this.anchors.includes('bottom') ? parentHeight - height - y : this.anchors.includes('below') ? parentHeight + y : y;
    }
}
