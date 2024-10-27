//A cache for filtered images, not a filtered cache of images.
interface CacheEntry {
    image: HTMLCanvasElement;
    lastUsed: number;
}

type SpriteType = HTMLCanvasElement | HTMLImageElement;

export class FilteredImageCache {
    private cache: Map<string, Map<SpriteType, CacheEntry>> = new Map();
    private frameCount: number = 0;

    public getOrCreateFilteredImage(sprite: SpriteType, filter: string): HTMLCanvasElement {
        let filterCache = this.cache.get(filter);
        if (!filterCache) {
            filterCache = new Map();
            this.cache.set(filter, filterCache);
        }

        let entry = filterCache.get(sprite);
        if (!entry) {
            const filteredImage = this.createFilteredImage(sprite, filter);
            entry = { image: filteredImage, lastUsed: this.frameCount };
            filterCache.set(sprite, entry);
        } else {
            entry.lastUsed = this.frameCount;
        }

        return entry.image;
    }

    private createFilteredImage(sprite: SpriteType, filter: string): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = sprite.width;
        canvas.height = sprite.height;
        const ctx = canvas.getContext('2d')!;
        ctx.filter = filter;
        ctx.drawImage(sprite, 0, 0);
        return canvas;
    }

    public advanceFrame() {
        this.frameCount++;
        for (const [filter, filterCache] of this.cache.entries()) {
            for (const [sprite, entry] of filterCache.entries()) {
                if (entry.lastUsed < this.frameCount - 3) {
                    filterCache.delete(sprite);
                }
            }
            if (filterCache.size === 0) {
                this.cache.delete(filter);
            }
        }
    }
}
