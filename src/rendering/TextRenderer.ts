import { TextureInfo } from "../ui/TextureInfo.js";

//Either directly render to the canvas or generate a texture that can be used by WebGL depending on whether you pass in a canvas or a WebGL context
export class TextRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private textureAtlas: Map<string, TextureInfo>;
    private gl: WebGLRenderingContext | null = null;

    constructor(glRenderer?: WebGLRenderingContext) {
        this.canvas = document.createElement('canvas'); //TODO: Use OffscreenCanvas with this as a fallback if you can find a way to make them compatible for use in later rendering
        this.ctx = <CanvasRenderingContext2D>this.canvas.getContext('2d', { preserveDrawingBuffer: true })!;
        if (glRenderer instanceof WebGLRenderingContext) {
            this.gl = glRenderer;
        }
        this.textureAtlas = new Map();
    }

    private generateTexture(text: string, font: string): TextureInfo {
        this.ctx.font = font;
        const metrics = this.ctx.measureText(text);
        const width = Math.ceil(metrics.width);
        const height = Math.ceil(metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent);

        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.clearRect(0, 0, width, height);

        this.ctx.font = font;
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(text, 0, 0);

        if (this.gl) {
            const texture = this.gl.createTexture()!;
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.canvas);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            return { id: "", filename: "", texture, width, height, image: undefined };
        } else {
            const ret = { id: "", filename: "", texture: undefined, width, height, image: this.canvas };
            //Recreate the canvas because we're giving this one up, unlike the WebGL mode where we reuse it since we return a proper texture in that case
            this.canvas = document.createElement('canvas');
            this.ctx = <CanvasRenderingContext2D>this.canvas.getContext('2d', { preserveDrawingBuffer: true })!;
            return ret;
        }
    }

    public getTextTexture(text: string, font: string): TextureInfo {
        const key = `${text}_${font}`;
        if (!this.textureAtlas.has(key)) {
            this.textureAtlas.set(key, this.generateTexture(text, font));
        }
        return this.textureAtlas.get(key)!;
    }

    public getCachedDimensions(text: string, font: string): [number, number] | undefined {
        const key = `${text}_${font}`;
        if (this.textureAtlas.has(key)) {
            const texture = this.textureAtlas.get(key)!;
            return [texture.width, texture.height];
        }
        return undefined;
    }

    public calculateWordWrap(text: string, font: string, maxWidth: number): { lines: string[], height: number } {
        this.ctx.font = font;

        const words = text.split(/([ -])/); // Split by space or hyphen and keep the separator
        const lines: string[] = [];
        let line = '';
        let height = 0;
        const lineHeight = parseInt(font.split('px')[0]) * 1.2; // Approximate line height

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n];
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                height += lineHeight;
                lines.push(line.trim());
                line = words[n];
            } else {
                line = testLine;
            }
        }
        height += lineHeight; // Add the last line
        lines.push(line.trim());

        return { lines, height };
    }

    public calculateTextNativeWidth(text: string, font: string): number {
        this.ctx.font = font;
        const metrics = this.ctx.measureText(text);
        return Math.ceil(metrics.width);
    }
}