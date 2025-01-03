import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { CityView } from "../ui/CityView.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { IRenderer } from "./IRenderer.js";
import { BIGGER_MOBILE_RATIO, DEVICE_PIXEL_RATIO, TILE_HEIGHT, TILE_WIDTH, calculateScreenPosition, cssDimToPixels, getInUseSpriteURLs, getLatePreloadSpriteURLs, hexToRgb, screenToWorldCoordinates, worldToScreenCoordinates } from "./RenderUtil.js";
import { TextRenderer } from "./TextRenderer.js";

export class WebGLRenderer implements IRenderer {
    private gl: WebGLRenderingContext;
    private textRenderer: TextRenderer;
    private program: WebGLProgram;
    private diamondProgram: WebGLProgram;
    private positionAttributeLocation: number;
    private texCoordAttributeLocation: number;
    private useTextureUniformLocation: WebGLUniformLocation;
    private colorUniformLocation: WebGLUniformLocation;
    private projectionMatrixUniformLocation: WebGLUniformLocation;
    private modelViewMatrixUniformLocation: WebGLUniformLocation;
    private sprites: Map<string, TextureInfo> = new Map();
    private windows: IHasDrawable[] = [];
    private worldCoordinateDrawables: IHasDrawable[] = [];
    private view: CityView | undefined; //Just so it's not passed around a bunch
    private modelViewStack: Float32Array[] = [];
    private cameraX: number = 0;
    private cameraY: number = 0;
    private zoom: number = 1;
    private fadeBuildingsBasedOnY: boolean = false;
    public setVisibilityMode(fade: boolean) { this.fadeBuildingsBasedOnY = fade; }
    public getVisibilityMode() { return this.fadeBuildingsBasedOnY; }

    private positionBuffer: WebGLBuffer;
    private texCoordBuffer: WebGLBuffer;
    private diamondPositionAttributeLocation: number;
    private diamondColorUniformLocation: WebGLUniformLocation | null;
    private diamondProjectionMatrixUniformLocation: WebGLUniformLocation | null;
    private diamondModelViewMatrixUniformLocation: WebGLUniformLocation | null;
    private diamondPositionBuffer: WebGLBuffer | null;
    private diamondPositions: Float32Array;
    private projectionMatrix: Float32Array = new Float32Array(); //Just to make the signature of drawTiles more like CanvasRenderer's

    constructor(private canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl', { alpha: false })!;
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        this.textRenderer = new TextRenderer(this.gl);

        this.program = this.createShaderProgram();
        this.gl.useProgram(this.program);
        this.diamondProgram = this.createDiamondShaderProgram();

        this.positionAttributeLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.texCoordAttributeLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.useTextureUniformLocation = this.gl.getUniformLocation(this.program, 'u_useTexture')!;
        this.colorUniformLocation = this.gl.getUniformLocation(this.program, 'u_color')!;
        this.projectionMatrixUniformLocation = this.gl.getUniformLocation(this.program, 'u_projectionMatrix')!;
        this.modelViewMatrixUniformLocation = this.gl.getUniformLocation(this.program, 'u_modelViewMatrix')!;

        this.gl.enableVertexAttribArray(this.positionAttributeLocation);
        this.gl.enableVertexAttribArray(this.texCoordAttributeLocation);

        this.positionBuffer = this.gl.createBuffer()!;
        this.texCoordBuffer = this.gl.createBuffer()!;

        //We always draw the entire texture, so establish that in advance.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ]), this.gl.STATIC_DRAW);
        this.gl.vertexAttribPointer(this.texCoordAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        //Diamond shader
        this.gl.useProgram(this.diamondProgram);
        this.diamondPositionAttributeLocation = this.gl.getAttribLocation(this.diamondProgram, "a_position");
        this.diamondColorUniformLocation = this.gl.getUniformLocation(this.diamondProgram, "u_color");
        this.diamondProjectionMatrixUniformLocation = this.gl.getUniformLocation(this.diamondProgram, "u_projectionMatrix");
        this.diamondModelViewMatrixUniformLocation = this.gl.getUniformLocation(this.diamondProgram, "u_modelViewMatrix");

        const halfWidth = TILE_WIDTH / 2;
        const halfHeight = TILE_HEIGHT / 2;
        const diamondPositions = [
            0, halfHeight,
            halfWidth, 0,
            TILE_WIDTH, halfHeight,
            halfWidth, TILE_HEIGHT,
        ];
        this.diamondPositions = new Float32Array(diamondPositions);
        this.diamondPositionBuffer = this.gl.createBuffer();

        this.gl.enableVertexAttribArray(this.diamondPositionAttributeLocation);
        this.gl.vertexAttribPointer(this.diamondPositionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        //But stick with the default program normally.
        this.gl.useProgram(this.program);
    }

    getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    addWorldCoordinateDrawable(drawable: IHasDrawable): void {
        this.worldCoordinateDrawables.push(drawable);
    }

    addWindow(window: IHasDrawable): void {
        this.windows.push(window);
    }

    clearWindowsAndWorldCoordinateDrawables(): void {
        this.windows = [];
        this.worldCoordinateDrawables = [];
    }

    setCameraPosition(x: number, y: number): void {
        this.cameraX = x;
        this.cameraY = y;
    }

    setZoom(zoom: number): void {
        this.zoom = zoom;
    }

    private async loadSprites(spriteUrls: { [key: string]: string }): Promise<void> {
        const loadTexture = (key: string, url: string): Promise<TextureInfo> => {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = "anonymous";
                image.onload = () => {
                    const texture = this.gl.createTexture()!;
                    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
                    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
                    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
                    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
                    //Don't need it: this.gl.generateMipmap(this.gl.TEXTURE_2D);
                    resolve(new TextureInfo(image.width, image.height, key, url, texture));
                };
                image.onerror = () => {
                    console.error(`Failed to load image at ${url}`);
                    resolve(new TextureInfo(0, 0, "", url));
                };
                image.src = url;
            });
        };

        const loadPromises = Object.entries(spriteUrls).map(async ([key, url]) => {
            try {
                const textureInfo = await loadTexture(key, url);
                if (textureInfo.id !== "") this.sprites.set(key, textureInfo);
            } catch { } //Don't want it to throw errors.
        });

        await Promise.all(loadPromises);
    }

    async preloadSprites(city: City): Promise<void> {
        const urls = getInUseSpriteURLs(city);
        await this.loadSprites(urls);
    }
    async loadMoreSprites(city: City, urls: { [key: string]: string }) {
        //Check if they're present first. Only call domPreloadSprites with the ones that aren't.
        const missingUrls = Object.fromEntries(
            Object.entries(urls).filter(([key]) => !this.sprites.has(key))
        );
        if (Object.keys(missingUrls).length) this.loadSprites(missingUrls);
    }
    latePreloadSprites() {
        setTimeout(async () => {
            const remainingUrls = getLatePreloadSpriteURLs();
            this.loadMoreSprites(null!, remainingUrls);
        }, 1000);
    }

    drawCity(view: CityView, city: City): void {
        this.view = view; //just so it's not passed around a bunch
        this.clear();

        this.projectionMatrix = this.createProjectionMatrix();
        this.gl.uniformMatrix4fv(this.projectionMatrixUniformLocation, false, this.projectionMatrix);

        // Apply camera transform
        this.pushMatrix();
        this.applyScale(this.zoom, this.zoom);
        this.applyTranslate(-this.cameraX, -this.cameraY);

        if (view.drawBuildings) {
            for (const building of city.sortBuildingsIsometric()) {
                this.drawBuilding(view, city, building);
            }
        }

        this.drawWorldCoordinateDrawables(city);

        if (view.drawResidentialDesirability) this.drawTiles(city, city.getResidentialDesirability, city.isRoadAdjacentAndNotRoad);
        if (view.drawLandValue) this.drawTiles(city, city.getLandValue);
        if (view.drawLuxury) this.drawTiles(city, city.getLuxury);
        if (view.drawBusiness) this.drawTiles(city, city.getBusinessDensity);
        if (view.drawPettyCrime) this.drawTiles(city, city.getNetPettyCrime);
        if (view.drawOrganizedCrime) this.drawTiles(city, city.getNetOrganizedCrime);
        if (view.drawGreenhouseGases) this.drawTiles(city, city.getGreenhouseGases);
        if (view.drawNoise) this.drawTiles(city, city.getNoise);
        if (view.drawParticulatePollution) this.drawTiles(city, city.getParticulatePollution);
        if (view.drawPoliceCoverage) this.drawTiles(city, city.getPoliceProtection);
        if (view.drawFireCoverage) this.drawTiles(city, city.getFireProtection);
        if (view.drawHealthCoverage) this.drawTiles(city, city.getHealthcare);
        if (view.drawEducation) this.drawTiles(city, city.getEducation);

        this.popMatrix();
        this.drawWindows();
    }

    private drawTiles(city: City, getter: (x: number, y: number) => number, condition?: (x: number, y: number) => boolean) {
        this.gl.useProgram(this.diamondProgram);
        this.gl.uniformMatrix4fv(this.diamondProjectionMatrixUniformLocation, false, this.projectionMatrix);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.diamondPositionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.diamondPositions, this.gl.STATIC_DRAW);
        this.gl.vertexAttribPointer(this.diamondPositionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

        for (let y = 0; y < city.height; y++) {
            for (let x = 0; x < city.width; x++) {
                if (condition && !condition.bind(city)(x, y)) continue; //Some tiles need not be drawn.
                const value = Math.max(0, Math.min(1, getter.bind(city)(x, y)));
                this.drawTile(city, x, y, new Float32Array(this.view!.getColorArray(value)));
            }
        }

        //Switch back
        this.gl.useProgram(this.program);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    private drawTile(city: City, tileX: number, tileY: number, color: Float32Array): void {
        const { x, y } = worldToScreenCoordinates(city, tileX - 1, tileY - 1, 1, 1, 0, true);
        this.pushMatrix();
        this.applyTranslate(x, y);

        const modelViewMatrix = this.getCurrentModelViewMatrix();
        this.gl.uniformMatrix4fv(this.diamondModelViewMatrixUniformLocation, false, modelViewMatrix);

        this.gl.uniform4fv(this.diamondColorUniformLocation, color);

        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);

        this.popMatrix();
    }

    private drawBuilding(view: CityView, city: City, building: Building): void {
        const { x, y } = calculateScreenPosition(building, city);
        this.pushMatrix();
        this.applyTranslate(x, y);

        const modelViewMatrix = this.getCurrentModelViewMatrix();
        this.gl.uniformMatrix4fv(this.modelViewMatrixUniformLocation, false, modelViewMatrix);

        const sprite = this.sprites.get("building/" + building.type + (building.variant || ""));
        const width = sprite?.width ?? (building.width * TILE_WIDTH);
        const height = sprite?.height ?? (building.height * TILE_HEIGHT);

        this.drawSprite(sprite, "#888888", width, height, true);

        //Warnings about the building's status
        if ((!building.roadConnected && building.needsRoad) || ((!building.powerConnected || !building.powered) && building.needsPower)) {
            this.applyTranslate((width - TILE_HEIGHT) / 2, -TILE_HEIGHT); //Weird spot, but for now, I'm drawing it on the foremost tile of the building, and I'm drawing it with TILE_HEIGHT x TILE_HEIGHT dimensions.
            this.gl.uniformMatrix4fv(this.modelViewMatrixUniformLocation, false, modelViewMatrix); //didn't push to the matrix stack, so the reference to modelViewMatrix is still valid

            //In order of precedence
            if (!building.roadConnected && building.needsRoad) this.drawSprite(this.sprites.get("ui/noroad"), "#ff000033", TILE_HEIGHT, TILE_HEIGHT);
            else if (!building.powerConnected && building.needsPower) this.drawSprite(this.sprites.get("ui/nopower"), "#ff000033", TILE_HEIGHT, TILE_HEIGHT);
            else if (!building.powered && building.needsPower) this.drawSprite(this.sprites.get("ui/outage"), "#ff000033", TILE_HEIGHT, TILE_HEIGHT);
        }

        if (view.showCollectibles) {
            const resources = building.collectiblesAsDrawable(city);
            if (resources) {
                resources.x = -TILE_HEIGHT / 2; //Assuming these icons are also TILE_HEIGHT x TILE_HEIGHT for now...
                resources.y = -TILE_HEIGHT;
                this.renderDrawable(resources, width, height);
            }
        }
        if (view.showProvisioning) {
            const resources = building.provisioningAsDrawable(city, view);
            if (resources) {
                resources.x = -TILE_HEIGHT / 2;
                resources.y = -TILE_HEIGHT;
                this.renderDrawable(resources, width, height);
            }
        }

        this.popMatrix();
    }

    drawWorldCoordinateDrawables(city: City): void {
        for (const hasDrawable of this.worldCoordinateDrawables) {
            const drawable = hasDrawable.asDrawable();

            //Convert the topmost parent's coordinates to world coordinates. I guess we'll leave the children in relative screen coordinates.
            //TODO: kinda gross that I'm duplicating these three lines from renderDrawable... but hopefully there will be very few world-coordinate "drawables" (it's mostly buildings and things attached to buildings)
            const sprite = ((drawable.image && this.sprites.get(drawable.image.id)) || (drawable.fallbackImage && this.sprites.get(drawable.fallbackImage.id)));
            const width = cssDimToPixels(drawable.width, this.gl.canvas.width) ?? sprite?.width ?? drawable.image?.width ?? this.gl.canvas.width;
            const height = cssDimToPixels(drawable.height, this.gl.canvas.height) ?? sprite?.height ?? drawable.image?.height ?? this.gl.canvas.height;
            const dimensionsAreTiles = !!drawable.tileWidth && !!drawable.tileHeight;

            const { x, y } = worldToScreenCoordinates(city, drawable.x || 0, drawable.y || 0, drawable.tileWidth ?? width, drawable.tileHeight ?? height, 0, dimensionsAreTiles);
            drawable.x = x;
            drawable.y = y - (dimensionsAreTiles ? height : 0);

            this.renderDrawable(drawable, this.gl.canvas.width, this.gl.canvas.height);
        }
    }

    screenToWorldCoordinates(city: City, screenX: number, screenY: number): { x: number, y: number } {
        return screenToWorldCoordinates(city, screenX / this.zoom + this.cameraX, screenY / this.zoom + this.cameraY);
    }

    drawWindows(): void {
        for (const window of this.windows) {
            this.renderDrawable(window.asDrawable(), this.gl.canvas.width, this.gl.canvas.height);
        }
        this.view?.getWindowDrawables().forEach(window => this.renderDrawable(window, this.gl.canvas.width, this.gl.canvas.height));
    }

    drawFPS(fps: number) {
        this.renderDrawable(new Drawable({ anchors: ["right"], x: 20, text: fps.toFixed(1) }), this.gl.canvas.width, this.gl.canvas.height)
    }

    getCorrectedWidth(sprite: TextureInfo, width: number, height: number): number {
        const expectedXOverY = sprite.width / sprite.height;
        const actualXOverY = width / height;
        if (actualXOverY > expectedXOverY) return height * expectedXOverY;
        return width;
    }

    renderDrawable(drawable: Drawable, parentWidth: number, parentHeight: number) {
        // Use the texture or fallback options
        let sprite = ((drawable.image && this.sprites.get(drawable.image.id)) || (drawable.fallbackImage && this.sprites.get(drawable.fallbackImage.id)));
        //TODO: implement borderImages

        let sumHeight: number | null = null;
        let moreLinesOfTextSprites: TextureInfo[] = [];
        if (drawable.text) {
            if (drawable.wordWrap) {
                const wordWrapInfo = this.textRenderer.calculateWordWrap(drawable.text, "bolder 18px verdana,arial", drawable.getWidth(null, parentWidth)); //TODO: Cache this
                sprite = this.textRenderer.getTextTexture(wordWrapInfo.lines[0], "bolder 18px verdana,arial");
                moreLinesOfTextSprites = wordWrapInfo.lines.slice(1).map(line => this.textRenderer.getTextTexture(line, "bolder 18px verdana,arial"));
            } else {
                sprite = this.textRenderer.getTextTexture(drawable.text, "bolder 18px verdana,arial"); //Uses a cache, so performance worries aren't too bad! //TODO: The cache is a memory leak. We need variable text like numbers to be removed if not used for some time or if the cache is more than a few dozen textures.
            }
        }

        let width = drawable.getWidth(sprite, parentWidth);
        const height = drawable.getHeight(sprite, parentHeight);
        let x = drawable.getX(width, parentWidth);
        let y = drawable.getY(height, parentHeight);

        //Right-align, e.g., for resources "x/y" the x should be right-aligned to the "/capacity"... not quite the same as anchor, as it doesn't depend on the parent, just on itself.
        if (drawable.text && sprite?.texture && drawable.rightAlign) x += width - drawable.getNaturalWidth(sprite, parentWidth) * (drawable.biggerOnMobile ? BIGGER_MOBILE_RATIO : 1);
        //noXStretch: Don't stretch text width more than you stretched its height
        if (drawable.text && sprite?.texture && drawable.noXStretch) width = this.getCorrectedWidth(sprite, width, height); //After the X positioning because if it's anchored to the right, I want to subtract the full width from the parent's right.
        if (drawable.anchors.includes('centerX')) x += parentWidth / 2;
        if (drawable.centerOnOwnX) x -= width / 2;

        if (drawable.anchors.includes('selfBottom')) y -= height; //Meant for buildings in ConstructMenu mainly

        // Use matrix stack to apply transformations so children depend on the parent's position
        this.pushMatrix();
        this.applyTranslate(x, y);
        const modelViewMatrix = this.getCurrentModelViewMatrix();
        this.gl.uniformMatrix4fv(this.modelViewMatrixUniformLocation, false, modelViewMatrix);

        this.drawSprite(sprite, drawable.fallbackColor, width, height, false, drawable.clipWidth);
        if (moreLinesOfTextSprites.length) { //This loop is solely because of word wrap
            sumHeight = height;
            this.pushMatrix();
            for (const extraLineSprite of moreLinesOfTextSprites) {
                let lineWidth = width; //so the final output width isn't set to the width of the last line, but of the first line. Still kinda sloppy...and probably not needed
                if (extraLineSprite.texture) {
                    //Reapply noXStretch logic
                    //I was assuming all lines other than the final one should be justified like this: && moreLinesOfTextSprites.indexOf(extraLineSprite) === moreLinesOfTextSprites.length - 1
                    if (drawable.noXStretch) lineWidth = this.getCorrectedWidth(extraLineSprite, width, height);
                    this.applyTranslate(0, height);
                    const modelViewMatrix = this.getCurrentModelViewMatrix();
                    this.gl.uniformMatrix4fv(this.modelViewMatrixUniformLocation, false, modelViewMatrix);
                    this.drawSprite(extraLineSprite, "#00000000", lineWidth, height, false, drawable.clipWidth);
                }
                sumHeight += height;
            }
            this.popMatrix();
        }

        sumHeight ??= height; //Word wrap will set this to the total height of all lines; everything else will just set it to the height of the one and only sprite
        if ((drawable.onClick || drawable.onDrag) && width && sumHeight) this.setDrawableScreenArea(drawable, modelViewMatrix, width, sumHeight);

        // Render children
        drawable.children.forEach(child => this.renderDrawable(child, drawable.keepParentWidth ? parentWidth : width, sumHeight!));

        this.popMatrix();
    }

    private setDrawableScreenArea(drawable: Drawable, matrix: Float32Array, width: number, height: number) {
        const corners = [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height]
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        corners.forEach(([x, y]) => {
            // Apply model-view transformation--no rotation allowed
            const transformedX = matrix[0] * x + matrix[4] * y + matrix[12]; //TODO: I should switch to DOMMatrix so I can get rid of the custom matrix multiplications and such. It's most likely more efficient, too.
            const transformedY = matrix[1] * x + matrix[5] * y + matrix[13];

            minX = Math.min(minX, transformedX);
            minY = Math.min(minY, transformedY);
            maxX = Math.max(maxX, transformedX);
            maxY = Math.max(maxY, transformedY);
        });

        drawable.screenArea = [minX, minY, maxX, maxY];
    }

    private drawSprite(sprite: TextureInfo | undefined, fallbackColor: string, width: number, height: number, bottomBased: boolean = false, clipWidth: number = 1) {
        if (sprite?.texture) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, sprite.texture);
            this.gl.uniform1i(this.useTextureUniformLocation, 1);
        } else {
            if (fallbackColor == "#00000000") return; //Nothing to draw, so save some processing time
            const color = hexToRgb(fallbackColor);
            this.gl.uniform4fv(this.colorUniformLocation, color);
            this.gl.uniform1i(this.useTextureUniformLocation, 0);
        }

        //Only if clipWidth was not 1 (rare), adjust the texture coordinates
        if (clipWidth !== 1) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
                0, 0,
                clipWidth, 0,
                0, 1,
                clipWidth, 1,
            ]), this.gl.STATIC_DRAW);
            this.gl.vertexAttribPointer(this.texCoordAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
            width *= Math.max(0, Math.min(1, clipWidth)); //Also adjust the drawing width
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([ //TODO: Just store this in a class field so it doesn't constantly have to garbage collect
            0, bottomBased ? -height : 0,
            width, bottomBased ? -height : 0,
            0, bottomBased ? 0 : height,
            width, bottomBased ? 0 : height,
        ]), this.gl.STATIC_DRAW);

        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        //Only if clipWidth was not 1 (rare), reset the texture coordinates
        if (clipWidth !== 1) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
                0, 0,
                1, 0,
                0, 1,
                1, 1,
            ]), this.gl.STATIC_DRAW);
            this.gl.vertexAttribPointer(this.texCoordAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        }
    }

    private createShaderProgram(): WebGLProgram {
        const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_modelViewMatrix;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

        const fragmentShaderSource = `
precision mediump float;

uniform vec4 u_color;       // Solid color to use if not using texture
varying vec2 v_texCoord;
uniform bool u_useTexture;  // Indicates whether to use texture or color
uniform sampler2D u_texture;

void main() {
  if (u_useTexture) {
    gl_FragColor = texture2D(u_texture, v_texCoord);
  } else {
    gl_FragColor = u_color;
  }
}
  `;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(program));
        }

        this.gl.validateProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.VALIDATE_STATUS)) {
            console.error('Shader program validation failed:', this.gl.getProgramInfoLog(program));
            throw new Error('Shader program validation failed');
        }

        return program;
    }

    createDiamondShaderProgram(): WebGLProgram {
        const vertexShaderSource = `
attribute vec2 a_position;
uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
void main() {
    gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 0.0, 1.0);
}
`;

        const fragmentShaderSource = `
precision mediump float;
uniform vec4 u_color;
void main() {
    gl_FragColor = u_color;
}
`;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Unable to initialize the diamond shader program: ' + this.gl.getProgramInfoLog(program));
        }

        this.gl.validateProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.VALIDATE_STATUS)) {
            console.error('Diamond shader program validation failed:', this.gl.getProgramInfoLog(program));
            throw new Error('Diamond shader program validation failed');
        }

        return program;
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    private createProjectionMatrix(): Float32Array {
        const left = 0;
        const right = this.canvas.width;
        const bottom = this.canvas.height;
        const top = 0;
        const near = -1;
        const far = 1;

        return new Float32Array([
            2 / (right - left), 0, 0, 0,
            0, 2 / (top - bottom), 0, 0,
            0, 0, 2 / (near - far), 0,
            (left + right) / (left - right), (bottom + top) / (bottom - top), (near + far) / (near - far), 1
        ]);
    }

    private createModelViewMatrix(x: number, y: number): Float32Array {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, 0, 1
        ]);
    }

    private pushMatrix() {
        const currentMatrix = this.getCurrentModelViewMatrix();
        const newMatrix = currentMatrix.slice();
        this.modelViewStack.push(newMatrix);
    }

    private popMatrix() {
        if (this.modelViewStack.length > 1) {
            this.modelViewStack.pop();
        }
    }

    private getCurrentModelViewMatrix(): Float32Array {
        return this.modelViewStack[this.modelViewStack.length - 1];
    }

    private applyTranslate(x: number, y: number) {
        const currentMatrix = this.getCurrentModelViewMatrix();
        const translationMatrix = this.createModelViewMatrix(x, y);
        this.multiplyMatrix(translationMatrix, currentMatrix);
    }

    private applyScale(scaleX: number, scaleY: number): void {
        const currentMatrix = this.getCurrentModelViewMatrix();
        const scaleMatrix = new Float32Array([
            scaleX, 0, 0, 0,
            0, scaleY, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        this.multiplyMatrix(scaleMatrix, currentMatrix);
    }

    private multiplyMatrix(a: Float32Array, b: Float32Array) {
        const result = new Float32Array(16);

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                for (let k = 0; k < 4; k++) {
                    result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
                }
            }
        }

        // Copy the result back to the current matrix (the second parameter)
        for (let i = 0; i < 16; i++) {
            b[i] = result[i];
        }
    }

    clear(): void {
        if (this.canvas.height != this.canvas.clientHeight * DEVICE_PIXEL_RATIO) this.canvas.height = this.canvas.clientHeight * DEVICE_PIXEL_RATIO;
        if (this.canvas.width != this.canvas.clientWidth * DEVICE_PIXEL_RATIO) this.canvas.width = this.canvas.clientWidth * DEVICE_PIXEL_RATIO;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.modelViewStack.splice(0, this.modelViewStack.length);
        this.modelViewStack.push(this.createModelViewMatrix(0, 0));
   }
}