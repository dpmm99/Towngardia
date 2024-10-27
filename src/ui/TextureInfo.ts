export class TextureInfo {
    constructor(
        public width: number,
        public height: number,
        public id: string,
        public filename: string = "",
        public texture?: WebGLTexture,
        public image?: HTMLImageElement | HTMLCanvasElement
    ) {
        if (!filename.length) this.filename = `assets/${id.toLowerCase()}.png`;
    }
}