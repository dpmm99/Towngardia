import { Drawable } from "./Drawable.js";

export interface IHasDrawable {
    asDrawable(): Drawable;
    getLastDrawable(): Drawable | null;
}